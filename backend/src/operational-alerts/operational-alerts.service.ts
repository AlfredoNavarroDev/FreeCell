import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { lowStockKey, orderReviewSlaKey } from './operational-alerts.constants';

interface AdminRecipient {
  id: string;
  email: string;
}

@Injectable()
export class OperationalAlertsService {
  constructor(
    private readonly ds: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  /** RF-ADM-26: un plan cae a LOW u OUT_OF_STOCK (ambos requieren reponer, v_plan_stock). */
  async checkLowStock(): Promise<number> {
    const admins = await this.admins();
    if (admins.length === 0) {
      return 0;
    }

    const rows: {
      planId: string;
      productName: string;
      planName: string;
      stockState: string;
      available: number;
    }[] = await this.ds.query(`
      SELECT p.id AS "planId", pr.name AS "productName", p.name AS "planName",
             vs."stockState", vs.available
        FROM plans p
        JOIN products pr ON pr.id = p."productId"
        JOIN v_plan_stock vs ON vs."planId" = p.id
       WHERE vs."stockState" IN ('LOW', 'OUT_OF_STOCK')
    `);

    let enqueued = 0;
    for (const row of rows) {
      for (const admin of admins) {
        await this.notifications.enqueue({
          key: lowStockKey(row.planId, admin.id),
          template: 'low-stock-alert',
          recipient: admin.email,
          data: {
            productName: row.productName,
            planName: row.planName,
            stockState: row.stockState,
            available: row.available,
          },
        });
        enqueued++;
      }
    }
    return enqueued;
  }

  /** RF-COM-14/D19: pedido IN_REVIEW con pago pendiente de revisión hace más de 24h. */
  async checkOrderReviewSla(): Promise<number> {
    const admins = await this.admins();
    if (admins.length === 0) {
      return 0;
    }

    const rows: { orderId: string; orderNumber: number }[] = await this.ds
      .query(`
      SELECT o.id AS "orderId", o."orderNumber"
        FROM orders o
        JOIN payments p ON p."orderId" = o.id AND p.status = 'PENDING'
       WHERE o.status = 'IN_REVIEW' AND p."createdAt" < now() - interval '24 hours'
    `);

    let enqueued = 0;
    for (const row of rows) {
      for (const admin of admins) {
        await this.notifications.enqueue({
          key: orderReviewSlaKey(row.orderId, admin.id),
          template: 'order-review-sla',
          recipient: admin.email,
          data: { orderNumber: row.orderNumber },
        });
        enqueued++;
      }
    }
    return enqueued;
  }

  private admins(): Promise<AdminRecipient[]> {
    return this.ds.query(`SELECT id, email FROM users WHERE role = 'ADMIN'`);
  }
}
