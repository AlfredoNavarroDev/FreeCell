import { ViewColumn, ViewEntity } from 'typeorm';

export type StockState = 'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK';

/** La fuente de verdad es la migración DatabaseLogic; `synchronize: false` evita que TypeORM la regenere. */
@ViewEntity({ name: 'v_plan_stock', synchronize: false })
export class PlanStockView {
  @ViewColumn()
  planId!: string;

  @ViewColumn()
  available!: number;

  @ViewColumn()
  reserved!: number;

  @ViewColumn()
  sold!: number;

  @ViewColumn()
  void!: number;

  @ViewColumn()
  stockState!: StockState;
}
