import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';

/**
 * Libera reservas vencidas. Toda la lógica de estado vive en fn_release_order (Postgres manda, regla 2):
 * bloquea el pedido y solo actúa si sigue PENDING_PAYMENT y vencido, así que es idempotente.
 */
@Injectable()
export class OrderReleaseService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Job `release-<orderId>`. Devuelve true solo si esta llamada liberó el pedido. */
  releaseIfExpired(orderId: string): Promise<boolean> {
    return this.ds.transaction(async (m) => {
      const [{ released }]: { released: boolean }[] = await m.query(
        `SELECT fn_release_order($1, 'EXPIRED', true) AS released`,
        [orderId],
      );
      if (released) {
        await this.audit.log(m, {
          actorId: null,
          action: 'order.expired',
          entity: 'order',
          entityId: orderId,
        });
      }
      return released;
    });
  }

  /** Barrido periódico: red de seguridad por si Redis perdió algún job. */
  sweepExpired(): Promise<string[]> {
    return this.ds.transaction(async (m) => {
      const rows: { id: string }[] = await m.query(
        `SELECT fn_release_expired() AS id`,
      );
      for (const { id } of rows) {
        await this.audit.log(m, {
          actorId: null,
          action: 'order.expired',
          entity: 'order',
          entityId: id,
          meta: { via: 'sweep' },
        });
      }
      return rows.map((row) => row.id);
    });
  }
}
