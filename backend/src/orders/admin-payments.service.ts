import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { type Currency } from '../database/currency';
import { Order, Payment, User } from '../database/entities';
import { OrderStatus, PaymentStatus } from '../database/enums';
import { NotificationsService } from '../notifications/notifications.service';
import {
  SettingsService,
  SETTING_RESERVATION_TTL_MINUTES,
} from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import {
  AdminPaymentItemDto,
  AdminPaymentResponseDto,
} from './dto/admin-payment-response.dto';
import { ListAdminPaymentsQueryDto } from './dto/list-admin-payments-query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import {
  PAYMENT_REJECTION_REASON_LABEL,
  RejectPaymentDto,
} from './dto/reject-payment.dto';
import { OrdersQueueService } from './orders-queue.service';
import {
  DEFAULT_RESERVATION_TTL_MINUTES,
  licenseDeliveredKey,
  paymentRejectedKey,
} from './orders.constants';

interface AdminPaymentRow {
  paymentId: string;
  orderId: string;
  orderNumber: number;
  status: PaymentStatus;
  paymentMethodId: string;
  operationNumber: string;
  proofKey: string;
  totalCents: number;
  currency: Currency;
  expiresAt: Date;
  toolUsername: string | null;
  createdAt: Date;
}

@Injectable()
export class AdminPaymentsService {
  private readonly logger = new Logger(AdminPaymentsService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly queue: OrdersQueueService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    dto: ListAdminPaymentsQueryDto,
  ): Promise<PaginatedResponseDto<AdminPaymentResponseDto>> {
    const offset = (dto.page - 1) * dto.pageSize;
    const rows: AdminPaymentRow[] = await this.ds.query(
      `SELECT p.id AS "paymentId", p."orderId", o."orderNumber", p.status,
              p."paymentMethodId", p."operationNumber", p."proofKey",
              o."totalCents", o.currency, o."expiresAt", o."toolUsername", p."createdAt"
         FROM payments p
         JOIN orders o ON o.id = p."orderId"
        WHERE ($1::text IS NULL OR p.status::text = $1)
        ORDER BY p."createdAt" ASC
        LIMIT $2 OFFSET $3`,
      [dto.status ?? null, dto.pageSize, offset],
    );
    const [{ count }]: { count: string }[] = await this.ds.query(
      `SELECT count(*) FROM payments WHERE ($1::text IS NULL OR status::text = $1)`,
      [dto.status ?? null],
    );

    const orderIds = rows.map((row) => row.orderId);
    const items: { orderId: string; planId: string; unitPriceCents: number }[] =
      orderIds.length
        ? await this.ds.query(
            `SELECT "orderId", "planId", "unitPriceCents" FROM order_items WHERE "orderId" = ANY($1::uuid[])`,
            [orderIds],
          )
        : [];
    const itemsByOrder = new Map<string, AdminPaymentItemDto[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push({ planId: item.planId, unitPriceCents: item.unitPriceCents });
      itemsByOrder.set(item.orderId, list);
    }

    const dtos = await Promise.all(
      rows.map(async (row) =>
        AdminPaymentResponseDto.from(
          row,
          itemsByOrder.get(row.orderId) ?? [],
          await this.storage.createProofDownloadUrl(row.proofKey),
        ),
      ),
    );
    return PaginatedResponseDto.from(
      dtos,
      Number(count),
      dto.page,
      dto.pageSize,
    );
  }

  /** Idempotente (docs/06): repetir sobre un pago ya APPROVED no falla ni vuelve a vender nada. */
  async approve(
    admin: AuthenticatedUser,
    paymentId: string,
  ): Promise<OrderResponseDto> {
    const approved = await this.ds.transaction(async (m) => {
      const rows: { approved: boolean }[] = await m.query(
        `SELECT fn_approve_payment($1, $2) AS approved`,
        [paymentId, admin.id],
      );
      const ok = rows[0]?.approved ?? false;
      if (ok) {
        await this.audit.log(m, {
          actorId: admin.id,
          action: 'payment.approved',
          entity: 'payment',
          entityId: paymentId,
        });
      }
      return ok;
    });
    if (!approved) {
      throw new NotFoundException('Pago no encontrado');
    }

    const order = await this.findOrderByPayment(paymentId);
    await this.afterApprove(order);
    return OrderResponseDto.from(
      order,
      order.items ?? [],
      await this.latestPayment(order.id),
    );
  }

  /** D18: 1.er/2.º rechazo vuelve a PENDING_PAYMENT con plazo extra; el 3.er rechazo cancela. */
  async reject(
    admin: AuthenticatedUser,
    paymentId: string,
    dto: RejectPaymentDto,
  ): Promise<OrderResponseDto> {
    const ttlMinutes = await this.settings.getNumber(
      SETTING_RESERVATION_TTL_MINUTES,
      DEFAULT_RESERVATION_TTL_MINUTES,
    );
    const reasonLabel = PAYMENT_REJECTION_REASON_LABEL[dto.reason];

    const newStatus = await this.ds.transaction(async (m) => {
      const rows: { newStatus: OrderStatus | null }[] = await m.query(
        `SELECT fn_reject_payment($1, $2, $3, $4) AS "newStatus"`,
        [paymentId, admin.id, reasonLabel, ttlMinutes],
      );
      const status = rows[0]?.newStatus ?? null;
      if (status) {
        await this.audit.log(m, {
          actorId: admin.id,
          action: 'payment.rejected',
          entity: 'payment',
          entityId: paymentId,
          meta: { reason: dto.reason, newStatus: status },
        });
      }
      return status;
    });
    if (!newStatus) {
      throw new NotFoundException('Pago no encontrado');
    }

    const order = await this.findOrderByPayment(paymentId);
    await this.afterReject(order, paymentId, newStatus, ttlMinutes);
    return OrderResponseDto.from(
      order,
      order.items ?? [],
      await this.latestPayment(order.id),
    );
  }

  private async findOrderByPayment(paymentId: string): Promise<Order> {
    const [row]: { orderId: string }[] = await this.ds.query(
      `SELECT "orderId" FROM payments WHERE id = $1`,
      [paymentId],
    );
    const order = await this.ds.getRepository(Order).findOne({
      where: { id: row.orderId },
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return order;
  }

  private async latestPayment(orderId: string): Promise<Payment | null> {
    return this.ds.getRepository(Payment).findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Fuera de la transacción, como en OrdersService: si falla la cola, no se revierte la venta. */
  private async afterApprove(order: Order): Promise<void> {
    try {
      const owner = await this.ds
        .getRepository(User)
        .findOne({ where: { id: order.userId } });
      if (owner) {
        await this.notifications.enqueue({
          key: licenseDeliveredKey(order.id),
          template: 'license-delivered',
          recipient: owner.email,
          data: { orderNumber: order.orderNumber },
        });
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(
        { err, orderId: order.id },
        'No se pudo encolar la notificación de entrega',
      );
    }
  }

  private async afterReject(
    order: Order,
    paymentId: string,
    newStatus: OrderStatus,
    ttlMinutes: number,
  ): Promise<void> {
    try {
      if (newStatus === OrderStatus.PENDING_PAYMENT) {
        await this.queue.rescheduleRelease(order.id, ttlMinutes * 60_000);
      }
      const owner = await this.ds
        .getRepository(User)
        .findOne({ where: { id: order.userId } });
      if (owner) {
        await this.notifications.enqueue({
          key: paymentRejectedKey(paymentId),
          template: 'payment-rejected',
          recipient: owner.email,
          data: { orderNumber: order.orderNumber },
        });
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(
        { err, orderId: order.id },
        'No se pudo reprogramar la liberación o notificar el rechazo',
      );
    }
  }
}
