import type { DataSource } from 'typeorm';
import type { PlanLabel } from './dto/order-response.dto';

/** RF-PED-03: "Mis pedidos" necesita el nombre del producto/plan, no solo el id. */
export async function planLabelsFor(
  ds: DataSource,
  planIds: string[],
): Promise<Map<string, PlanLabel>> {
  if (planIds.length === 0) return new Map();
  const rows: { id: string; planName: string; productName: string }[] =
    await ds.query(
      `SELECT pl.id, pl.name AS "planName", pr.name AS "productName"
         FROM plans pl
         JOIN products pr ON pr.id = pl."productId"
        WHERE pl.id = ANY($1::uuid[])`,
      [[...new Set(planIds)]],
    );
  return new Map(
    rows.map((row) => [
      row.id,
      { planName: row.planName, productName: row.productName },
    ]),
  );
}
