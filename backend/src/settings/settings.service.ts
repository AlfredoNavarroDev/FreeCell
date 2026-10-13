import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../database/entities';

export const SETTING_RESERVATION_TTL_MINUTES = 'reservationTtlMinutes';

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
