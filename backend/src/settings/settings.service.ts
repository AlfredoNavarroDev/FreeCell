import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Setting } from '../database/entities';

export const SETTING_RESERVATION_TTL_MINUTES = 'reservationTtlMinutes';
export const SETTING_USD_PEN_RATE = 'usdPenRate';

/** D74: placeholder de negocio hasta que Joseph dé la cifra real. */
export const SETTING_NEW_CUSTOMER_GRACE_ORDERS = 'newCustomerGraceOrders';
export const SETTING_NEW_CUSTOMER_MAX_ORDER_CENTS_PEN =
  'newCustomerMaxOrderCentsPen';
export const SETTING_NEW_CUSTOMER_MAX_ORDER_CENTS_USD =
  'newCustomerMaxOrderCentsUsd';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
    private readonly audit: AuditService,
  ) {}

  /** Lee un número de settings; si falta o no es número, devuelve `fallback`. */
  async getNumber(key: string, fallback: number): Promise<number> {
    const row = await this.settings.findOne({ where: { key } });
    return typeof row?.value === 'number' && Number.isFinite(row.value)
      ? row.value
      : fallback;
  }

  /** Igual que `getNumber`, pero `null` si nunca se configuró (en vez de un fallback indistinguible). */
  async getNumberOrNull(
    key: string,
    manager?: EntityManager,
  ): Promise<number | null> {
    const repo = manager ? manager.getRepository(Setting) : this.settings;
    const row = await repo.findOne({ where: { key } });
    return typeof row?.value === 'number' && Number.isFinite(row.value)
      ? row.value
      : null;
  }

  /** Upsert auditado (regla 6) de un número en settings. Reusa la transacción del llamador si se pasa `manager`. */
  async setNumber(
    key: string,
    value: number,
    actorId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const run = async (m: EntityManager): Promise<void> => {
      await m.getRepository(Setting).upsert({ key, value }, ['key']);
      await this.audit.log(m, {
        actorId,
        action: 'setting.updated',
        entity: 'setting',
        entityId: key,
        meta: { key, value },
      });
    };
    if (manager) {
      await run(manager);
    } else {
      await this.settings.manager.transaction(run);
    }
  }
}
