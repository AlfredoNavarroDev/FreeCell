import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { LicenseItem, Order, OrderItem } from '../database/entities';
import { LicenseStatus, OrderStatus } from '../database/enums';
import { NotificationsService } from '../notifications/notifications.service';
import {
  SETTING_RESERVATION_TTL_MINUTES,
  SettingsService,
} from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { CreateUploadUrlDto } from '../storage/dto/create-upload-url.dto';
import { UploadUrlResponseDto } from '../storage/dto/upload-url-response.dto';
import { StorageService } from '../storage/storage.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrdersQueueService } from './orders-queue.service';
import {
  DEFAULT_RESERVATION_TTL_MINUTES,
  orderCreatedKey,
} from './orders.constants';

interface PlanRow {
  id: string;
  name: string;
  active: boolean;
  requiresToolUsername: boolean;
  priceCents: number | null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly queue: OrdersQueueService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Reserva todo el carrito en una transacción (RF-COM-01/02, D30, D61).
   * `FOR UPDATE SKIP LOCKED` hace que compradores simultáneos tomen licencias distintas (regla 1);
   * ordenar por planId fija el orden de bloqueo y evita deadlocks entre carritos cruzados.
   */
  async create(
    user: AuthenticatedUser,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const ttlMinutes = await this.settings.getNumber(
      SETTING_RESERVATION_TTL_MINUTES,
      DEFAULT_RESERVATION_TTL_MINUTES,
    );
    const items = [...dto.items].sort((a, b) =>
      a.planId.localeCompare(b.planId),
    );

    const { order, orderItems } = await this.ds.transaction(async (m) => {
      const plans: PlanRow[] = await m.query(
        `SELECT p.id, p.name, (p.active AND pr.active) AS active, pr."requiresToolUsername", pp."priceCents"
           FROM plans p
           JOIN products pr ON pr.id = p."productId"
           LEFT JOIN plan_prices pp ON pp."planId" = p.id AND pp.currency = $2
          WHERE p.id = ANY($1::uuid[])`,
        [items.map((item) => item.planId), dto.currency],
      );
      const planById = new Map(plans.map((plan) => [plan.id, plan]));

      for (const item of items) {
        const plan = planById.get(item.planId);
        if (!plan || !plan.active) {
          throw new NotFoundException(
            'Uno de los planes no existe o no está disponible',
          );
        }
        if (plan.priceCents === null) {
          throw new ConflictException(
            `${plan.name} no está disponible en ${dto.currency}`,
          );
        }
        if (plan.requiresToolUsername && !dto.toolUsername) {
          throw new BadRequestException(
            `${plan.name} requiere tu usuario de la herramienta`,
          );
        }
      }

      const reservedByPlan = new Map<string, string[]>();
      for (const item of items) {
        const rows: { id: string }[] = await m.query(
          `SELECT id FROM license_items
            WHERE "planId" = $1 AND status = 'AVAILABLE'
            ORDER BY "createdAt"
            LIMIT $2
            FOR UPDATE SKIP LOCKED`,
          [item.planId, item.qty],
        );
        if (rows.length < item.qty) {
          throw new ConflictException(
            `Sin stock suficiente de ${planById.get(item.planId)!.name}`,
          );
        }
        reservedByPlan.set(
          item.planId,
          rows.map((row) => row.id),
        );
      }

      const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
      const totalCents = items.reduce(
        (sum, item) => sum + planById.get(item.planId)!.priceCents! * item.qty,
        0,
      );
      const order = await m.save(
        Order,
        m.create(Order, {
          userId: user.id,
          status: OrderStatus.PENDING_PAYMENT,
          totalCents,
          currency: dto.currency,
          toolUsername: dto.toolUsername ?? null,
          expiresAt,
          cancelReason: null,
        }),
      );

      const orderItems: OrderItem[] = [];
      for (const item of items) {
        const unitPriceCents = planById.get(item.planId)!.priceCents!;
        for (const licenseId of reservedByPlan.get(item.planId)!) {
          const orderItem = await m.save(
            OrderItem,
            m.create(OrderItem, {
              orderId: order.id,
              planId: item.planId,
              unitPriceCents,
            }),
          );
          await m.update(
            LicenseItem,
            { id: licenseId },
            {
              status: LicenseStatus.RESERVED,
              orderItemId: orderItem.id,
              reservedUntil: expiresAt,
            },
          );
          orderItems.push(orderItem);
        }
      }

      await this.audit.log(m, {
        actorId: user.id,
        action: 'order.created',
        entity: 'order',
        entityId: order.id,
        meta: { items: dto.items, totalCents, currency: dto.currency },
      });
      return { order, orderItems };
    });

    await this.afterCreate(order, user.id, ttlMinutes);
    return OrderResponseDto.from(order, orderItems);
  }

  async findForUser(
    userId: string,
    orderId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.findOwned(userId, orderId);
    return OrderResponseDto.from(order, order.items ?? []);
  }

  /** Solo PENDING_PAYMENT; repetirlo sobre un pedido ya cancelado responde 200 sin cambios. */
  async cancel(
    user: AuthenticatedUser,
    orderId: string,
  ): Promise<OrderResponseDto> {
    const current = await this.findOwned(user.id, orderId);
    if (current.status === OrderStatus.CANCELLED) {
      return OrderResponseDto.from(current, current.items ?? []);
    }

    const released = await this.ds.transaction(async (m) => {
      const [{ released }]: { released: boolean }[] = await m.query(
        `SELECT fn_release_order($1, 'CUSTOMER_CANCELLED', false) AS released`,
        [orderId],
      );
      if (released) {
        await this.audit.log(m, {
          actorId: user.id,
          action: 'order.cancelled',
          entity: 'order',
          entityId: orderId,
        });
      }
      return released;
    });

    const fresh = await this.findOwned(user.id, orderId);
    if (!released && fresh.status !== OrderStatus.CANCELLED) {
      throw new ConflictException(
        'Solo puedes cancelar un pedido pendiente de pago',
      );
    }
    return OrderResponseDto.from(fresh, fresh.items ?? []);
  }

  /** Solo mientras el pedido sigue PENDING_PAYMENT; no es una mutación (no hay auditoría, RNF-SEG-09). */
  async requestPaymentUploadUrl(
    user: AuthenticatedUser,
    orderId: string,
    dto: CreateUploadUrlDto,
  ): Promise<UploadUrlResponseDto> {
    const order = await this.findOwned(user.id, orderId);
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new ConflictException(
        'Solo puedes subir el comprobante mientras el pedido está pendiente de pago',
      );
    }
    const { uploadUrl, proofKey } = await this.storage.createProofUploadUrl(
      order.id,
      dto.contentType,
    );
    return UploadUrlResponseDto.from(uploadUrl, proofKey);
  }

  /** Un pedido ajeno responde 404, igual que uno inexistente (regla 7). */
  private async findOwned(userId: string, orderId: string): Promise<Order> {
    const order = await this.ds.getRepository(Order).findOne({
      where: { id: orderId, userId },
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return order;
  }

  /**
   * Fuera de la transacción: si Redis falla, el pedido ya existe y el barrido
   * (sweep-expired) lo libera igual. Por eso no se devuelve error al cliente.
   */
  private async afterCreate(
    order: Order,
    userId: string,
    ttlMinutes: number,
  ): Promise<void> {
    try {
      await this.queue.scheduleRelease(order.id, ttlMinutes * 60_000);
      const owner = await this.users.findById(userId);
      if (owner) {
        await this.notifications.enqueue({
          key: orderCreatedKey(order.id),
          template: 'order-created',
          recipient: owner.email,
          data: { orderNumber: order.orderNumber },
        });
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(
        { err, orderId: order.id },
        'No se pudo encolar la liberación o la notificación',
      );
    }
  }
}
