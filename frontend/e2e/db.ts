import { randomBytes } from "node:crypto";
import { Client } from "pg";

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function markEmailVerified(email: string): Promise<void> {
  await withClient((client) =>
    client.query(`UPDATE users SET "emailVerifiedAt" = now() WHERE email = $1`, [email.toLowerCase()]),
  );
}

export async function expireOrderNow(orderId: string): Promise<void> {
  await withClient((client) =>
    client.query(`UPDATE orders SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`, [orderId]),
  );
}

// `POST /orders/:id/cancel` (fn_release_order) solo libera pedidos PENDING_PAYMENT (regla de
// dominio #3: IN_REVIEW no se libera por expiración ni por cancelación del cliente). El flujo
// feliz del e2e ya llegó a IN_REVIEW al terminar, así que la licencia fija del seed (solo 5)
// se liberaría acá directo en vez de quedar reservada para siempre entre corridas.
export async function releaseOrderLicenses(orderId: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `UPDATE license_items li SET status = 'AVAILABLE', "orderItemId" = NULL, "reservedUntil" = NULL
         FROM order_items oi
        WHERE oi."orderId" = $1 AND li."orderItemId" = oi.id AND li.status = 'RESERVED'`,
      [orderId],
    );
    await client.query(
      `UPDATE orders SET status = 'CANCELLED', "cancelReason" = 'E2E_TEST_CLEANUP' WHERE id = $1`,
      [orderId],
    );
  });
}

// Aprobar vende la licencia (SOLD) y entrega el pedido (DELIVERED) — correcto y sin vuelta atrás vía
// API (no existe un endpoint de "deshacer entrega"). Una licencia SOLD nunca vuelve a AVAILABLE (lo
// bloquea trg_license_status_guard) así que, solo para sostenibilidad del entorno de dev/test local
// (cuentas de prueba descartables, no datos de producción), se la retira (VOID) y se repone una licencia
// nueva AVAILABLE del mismo plan/lote para que el e2e de aprobación sea repetible sin agotar las 5
// licencias fijas del seed. El pedido se queda en DELIVERED (ya es su estado terminal correcto):
// trg_order_status_guard solo permite 'IN_REVIEW->CANCELLED', nunca 'DELIVERED->CANCELLED' — no hay
// nada que "cancelar" acá, solo reponer stock.
export async function releaseDeliveredOrderLicense(orderId: string): Promise<void> {
  await withClient(async (client) => {
    const { rows } = await client.query<{ id: string; planId: string; batchId: string }>(
      `SELECT li.id, li."planId", li."batchId"
         FROM license_items li
         JOIN order_items oi ON li."orderItemId" = oi.id
        WHERE oi."orderId" = $1 AND li.status = 'SOLD'`,
      [orderId],
    );
    for (const row of rows) {
      await client.query(
        `INSERT INTO license_items ("planId", "batchId", "secretEncrypted", "secretHash", status)
         VALUES ($1, $2, 'test:test:test', $3, 'AVAILABLE')`,
        [row.planId, row.batchId, randomBytes(32).toString("hex")],
      );
      await client.query(`UPDATE license_items SET status = 'VOID' WHERE id = $1`, [row.id]);
    }
  });
}
