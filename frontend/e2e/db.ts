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
