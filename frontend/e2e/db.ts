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
