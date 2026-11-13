import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SettingsService, SETTING_USD_PEN_RATE } from '../settings/settings.service';
import { LicenseStatus } from '../database/enums';
import type { StockState } from '../database/views/plan-stock.view';
import { AvailableLicenseDto } from './dto/available-license.dto';
import {
  InventoryItemDto,
  InventoryResponseDto,
} from './dto/inventory-item.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly ds: DataSource,
    private readonly settings: SettingsService,
  ) {}

  async list(): Promise<InventoryResponseDto> {
    const rows: {
      planId: string;
      productName: string;
      planName: string;
      lowStockThreshold: number;
      available: number;
      reserved: number;
      sold: number;
      stockState: StockState;
    }[] = await this.ds.query(`
      SELECT pl.id AS "planId", pr.name AS "productName", pl.name AS "planName",
             pl."lowStockThreshold", vs.available, vs.reserved, vs.sold, vs."stockState"
        FROM plans pl
        JOIN products pr ON pr.id = pl."productId"
        JOIN v_plan_stock vs ON vs."planId" = pl.id
       ORDER BY pr.name, pl.name
    `);
    const usdPenRate = await this.settings.getNumberOrNull(SETTING_USD_PEN_RATE);
    return { items: rows.map((row) => InventoryItemDto.from(row)), usdPenRate };
  }

  async listAvailableLicenses(planId: string): Promise<AvailableLicenseDto[]> {
    const plan = await this.ds.query(`SELECT id FROM plans WHERE id = $1`, [
      planId,
    ]);
    if (plan.length === 0) {
      throw new NotFoundException('Plan no encontrado');
    }
    const rows: { id: string; createdAt: Date }[] = await this.ds.query(
      `SELECT id, "createdAt" FROM license_items
        WHERE "planId" = $1 AND status = $2
        ORDER BY "createdAt" ASC`,
      [planId, LicenseStatus.AVAILABLE],
    );
    return rows.map((row) => ({ id: row.id, createdAt: row.createdAt }));
  }
}
