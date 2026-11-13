import { ApiProperty } from '@nestjs/swagger';
import type { StockState } from '../../database/views/plan-stock.view';

interface InventoryItemRow {
  planId: string;
  productName: string;
  planName: string;
  lowStockThreshold: number;
  available: number;
  reserved: number;
  sold: number;
  stockState: StockState;
}

/** Fila por plan de la pantalla de Inventario (S7). */
export class InventoryItemDto {
  @ApiProperty() planId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() lowStockThreshold!: number;
  @ApiProperty() available!: number;
  @ApiProperty() reserved!: number;
  @ApiProperty() sold!: number;
  @ApiProperty({ enum: ['IN_STOCK', 'LOW', 'OUT_OF_STOCK'] })
  status!: StockState;

  static from(row: InventoryItemRow): InventoryItemDto {
    return {
      planId: row.planId,
      productName: row.productName,
      planName: row.planName,
      lowStockThreshold: row.lowStockThreshold,
      available: row.available,
      reserved: row.reserved,
      sold: row.sold,
      status: row.stockState,
    };
  }
}

export class InventoryResponseDto {
  @ApiProperty({ type: [InventoryItemDto] }) items!: InventoryItemDto[];
  @ApiProperty({ type: Number, nullable: true }) usdPenRate!: number | null;
}
