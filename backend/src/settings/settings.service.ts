import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../database/entities';

export const SETTING_RESERVATION_TTL_MINUTES = 'reservationTtlMinutes';

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
  ) {}

  /** Lee un número de settings; si falta o no es número, devuelve `fallback`. */
  async getNumber(key: string, fallback: number): Promise<number> {
    const row = await this.settings.findOne({ where: { key } });
    return typeof row?.value === 'number' && Number.isFinite(row.value)
      ? row.value
      : fallback;
  }
}
