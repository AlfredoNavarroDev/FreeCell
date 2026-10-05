import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { DataSource, In, LessThan } from 'typeorm';
import { LicenseStatus, OrderStatus } from '../database/enums';
import { LicenseItem, Order, OrderItem, Plan } from '../database/entities';
import { DEFAULT_RESERVATION_TTL_MS, QUEUE_RESERVATIONS, SWEEP_EVERY_MS } from '../queues/queues.constants';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrdersService.name);
  private readonly ttlMs: number;

  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue(QUEUE_RESERVATIONS) private readonly reservations: Queue,
    config: ConfigService,
  ) {
    this.ttlMs = Number(config.get('RESERVATION_TTL_MS') ?? DEFAULT_RESERVATION_TTL_MS);
  }

  /** Red de seguridad: un trabajo repetible que libera reservas vencidas aunque se pierda algún "release". */
  async onApplicationBootstrap() {
    await this.reservations.upsertJobScheduler(
      'sweep-expired',
      { every: SWEEP_EVERY_MS },
      { name: 'sweep', opts: { removeOnComplete: true } },
    );
  }

  /**
   * Reserva una licencia y crea el pedido en una sola transacción.
   *
   * `FOR UPDATE SKIP LOCKED` hace que, si dos clientes compran a la vez, cada uno bloquee una
   * licencia distinta (o reciba "sin stock"), sin esperar al otro y sin asignar nunca la misma.
   */
  async reserve(userId: string, dto: CreateOrderDto): Promise<Order> {
    const expiresAt = new Date(Date.now() + this.ttlMs);

    const order = await this.dataSource.transaction(async (em) => {
      const plan = await em.findOne(Plan, { where: { id: dto.planId, active: true } });
      if (!plan) throw new NotFoundException('Ese plan no está disponible');

      const [license] = await em
        .createQueryBuilder(LicenseItem, 'l')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('l.planId = :planId AND l.status = :status', { planId: plan.id, status: LicenseStatus.AVAILABLE })
        .orderBy('l.createdAt', 'ASC')
        .limit(1)
        .getMany();
      if (!license) throw new ConflictException('Este plan está agotado por ahora');

      const created = await em.save(
        em.create(Order, {
          userId,
          status: OrderStatus.PENDING_PAYMENT,
          totalCents: plan.priceCents,
          toolUsername: dto.toolUsername ?? null,
          expiresAt,
          items: [em.create(OrderItem, { planId: plan.id, unitPriceCents: plan.priceCents })],
        }),
      );

      await em.update(LicenseItem, license.id, {
        status: LicenseStatus.RESERVED,
        reservedUntil: expiresAt,
        orderItemId: created.items![0].id,
      });
      return created;
    });

    // Si Redis falla aquí, el pedido igual se libera con el barrido periódico.
    await this.reservations
      .add('release', { orderId: order.id }, { jobId: `release-${order.id}`, delay: this.ttlMs })
      .catch((e) => this.logger.error(`No se pudo programar la liberación de ${order.id}: ${e}`));

    return order;
  }

  /**
   * Libera la reserva SOLO si el pedido sigue esperando pago. Es idempotente: si el cliente ya
   * subió su comprobante (IN_REVIEW) o ya se entregó, no hace nada. Devuelve true si liberó.
   */
  async releaseIfUnpaid(orderId: string): Promise<boolean> {
    return this.dataSource.transaction(async (em) => {
      const order = await em
        .createQueryBuilder(Order, 'o')
        .setLock('pessimistic_write')
        .where('o.id = :orderId', { orderId })
        .getOne();
      if (!order || order.status !== OrderStatus.PENDING_PAYMENT) return false;

      await em.update(Order, order.id, { status: OrderStatus.CANCELLED });
      const items = await em.find(OrderItem, { where: { orderId } });
      if (items.length) {
        await em.update(
          LicenseItem,
          { orderItemId: In(items.map((i) => i.id)), status: LicenseStatus.RESERVED },
          { status: LicenseStatus.AVAILABLE, reservedUntil: null, orderItemId: null },
        );
      }
      return true;
    });
  }

  /** Libera todas las reservas vencidas que sigan sin pago. */
  async sweepExpired(): Promise<number> {
    const expired = await this.dataSource.getRepository(Order).find({
      where: { status: OrderStatus.PENDING_PAYMENT, expiresAt: LessThan(new Date()) },
      select: ['id'],
      take: 200,
    });
    let released = 0;
    for (const { id } of expired) {
      if (await this.releaseIfUnpaid(id)) released++;
    }
    if (released) this.logger.log(`Barrido: ${released} reservas liberadas`);
    return released;
  }
}
