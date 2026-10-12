import { ViewColumn, ViewEntity } from 'typeorm';
import { type Currency } from '../currency';

/** Una fila por licencia vendida, con margen en la moneda de la venta (D62). */
@ViewEntity({ name: 'v_sales_lines', synchronize: false })
export class SalesLineView {
  @ViewColumn()
  orderId!: string;

  @ViewColumn()
  orderItemId!: string;

  @ViewColumn()
  planId!: string;

  @ViewColumn()
  productId!: string;

  @ViewColumn()
  currency!: Currency;

  @ViewColumn()
  unitPriceCents!: number;

  @ViewColumn()
  costCurrency!: Currency;

  @ViewColumn()
  unitCostCents!: number;

  @ViewColumn()
  fxRatePen!: string | null;

  @ViewColumn()
  marginCents!: number | null;

  @ViewColumn()
  soldAt!: Date | null;
}
