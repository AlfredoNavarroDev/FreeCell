import 'dotenv/config';
import { hash } from 'bcryptjs';
import { DataSource, type EntityManager } from 'typeorm';
import { CryptoService } from '../common/crypto/crypto.service';
import { validateEnv } from '../core/config/env.validation';
import { buildDataSourceOptions } from './data-source-options';

export interface SeedEnv {
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  LICENSE_ENC_KEY: string;
}

/** Datos de desarrollo. Nombres, precios y datos de cobro son placeholders: no son datos de negocio reales. */
const PAYMENT_METHODS = [
  {
    code: 'yape',
    name: 'Yape',
    kind: 'WALLET',
    currencies: ['PEN'],
    instructions: { phone: '[número Yape]', holder: '[titular]' },
  },
  {
    code: 'plin',
    name: 'Plin',
    kind: 'WALLET',
    currencies: ['PEN'],
    instructions: { phone: '[número Plin]', holder: '[titular]' },
  },
  {
    code: 'transfer-pen',
    name: 'Transferencia en soles',
    kind: 'BANK_TRANSFER',
    currencies: ['PEN'],
    instructions: {
      bank: '[banco]',
      account: '[cuenta]',
      cci: '[CCI]',
      holder: '[titular]',
    },
  },
  {
    code: 'transfer-usd',
    name: 'Transferencia en dólares',
    kind: 'BANK_TRANSFER',
    currencies: ['USD'],
    instructions: {
      bank: '[banco]',
      account: '[cuenta]',
      cci: '[CCI]',
      holder: '[titular]',
    },
  },
  {
    code: 'binance-pay',
    name: 'Binance Pay (USDT)',
    kind: 'CRYPTO',
    currencies: ['USD'],
    instructions: {
      payId: '[Binance Pay ID]',
      holder: '[titular]',
      asset: 'USDT',
    },
  },
];

async function upsertPlan(
  m: EntityManager,
  productId: string,
  name: string,
  prices: Record<string, number>,
): Promise<string> {
  let [plan]: { id: string }[] = await m.query(
    `SELECT id FROM plans WHERE "productId" = $1 AND name = $2`,
    [productId, name],
  );
  if (!plan) {
    [plan] = await m.query(
      `INSERT INTO plans ("productId", name, "durationDays") VALUES ($1, $2, 30) RETURNING id`,
      [productId, name],
    );
  }
  for (const [currency, priceCents] of Object.entries(prices)) {
    await m.query(
      `INSERT INTO plan_prices ("planId", currency, "priceCents") VALUES ($1, $2, $3)
       ON CONFLICT ("planId", currency) DO UPDATE SET "priceCents" = EXCLUDED."priceCents"`,
      [plan.id, currency, priceCents],
    );
  }
  return plan.id;
}

/** Idempotente: se puede correr varias veces sin duplicar nada. No pisa métodos de pago ni settings editados. */
export async function runSeed(ds: DataSource, env: SeedEnv): Promise<void> {
  const crypto = new CryptoService(env.LICENSE_ENC_KEY);
  const adminHash = await hash(env.ADMIN_PASSWORD, 12);

  await ds.transaction(async (m) => {
    // `WHERE users.role = 'ADMIN'` evita que un ADMIN_EMAIL que choque con una cuenta existente
    // de un cliente real se la apropie en silencio: si la fila en conflicto no es ya ADMIN, el DO
    // UPDATE no aplica (no-op) y no se devuelve fila — eso es la señal para avisar.
    const upserted: { id: string }[] = await m.query(
      `INSERT INTO users (email, "passwordHash", name, role, "emailVerifiedAt")
       VALUES ($1, $2, '[Admin]', 'ADMIN', now())
       ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", role = 'ADMIN'
       WHERE users.role = 'ADMIN'
       RETURNING id`,
      [env.ADMIN_EMAIL.trim().toLowerCase(), adminHash],
    );
    if (upserted.length === 0) {
      console.warn(
        `ADMIN_EMAIL (${env.ADMIN_EMAIL}) ya es la cuenta de un cliente existente: no se tocó (seed es no-op aquí).`,
      );
    }

    const [category]: { id: string }[] = await m.query(
      `INSERT INTO categories (name) VALUES ('[Categoría demo]')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const [product]: { id: string }[] = await m.query(
      `INSERT INTO products (name, slug, "categoryId") VALUES ('[Producto demo]', 'producto-demo', $1)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [category.id],
    );

    const demoPlanId = await upsertPlan(m, product.id, '[Plan demo]', {
      PEN: 1000,
      USD: 300,
    });
    await upsertPlan(m, product.id, '[Plan demo solo PEN]', { PEN: 1000 });

    let [batch]: { id: string }[] = await m.query(
      `SELECT id FROM license_batches WHERE "planId" = $1 AND notes = '[seed]'`,
      [demoPlanId],
    );
    if (!batch) {
      [batch] = await m.query(
        `INSERT INTO license_batches ("planId", "unitCostCents", "costCurrency", "fxRatePen", notes)
         VALUES ($1, 200, 'USD', 3.6200, '[seed]') RETURNING id`,
        [demoPlanId],
      );
    }
    for (let i = 1; i <= 5; i++) {
      const secret = `DEMO-${String(i).padStart(4, '0')}`;
      // El HMAC es determinista: ON CONFLICT evita duplicar la clave al re-ejecutar.
      await m.query(
        `INSERT INTO license_items ("planId", "batchId", "secretEncrypted", "secretHash")
         VALUES ($1, $2, $3, $4) ON CONFLICT ("secretHash") DO NOTHING`,
        [demoPlanId, batch.id, crypto.encrypt(secret), crypto.hash(secret)],
      );
    }

    for (const [index, method] of PAYMENT_METHODS.entries()) {
      await m.query(
        `INSERT INTO payment_methods (code, name, kind, currencies, instructions, "sortOrder")
         VALUES ($1, $2, $3, $4::char(3)[], $5::jsonb, $6)
         ON CONFLICT (code) DO NOTHING`,
        [
          method.code,
          method.name,
          method.kind,
          method.currencies,
          JSON.stringify(method.instructions),
          index + 1,
        ],
      );
    }

    await m.query(
      `INSERT INTO settings (key, value) VALUES ('reservationTtlMinutes', '30'::jsonb) ON CONFLICT (key) DO NOTHING`,
    );
  });
}

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error(
      'Define ADMIN_EMAIL y ADMIN_PASSWORD en .env antes de correr el seed',
    );
  }
  const ds = await new DataSource(buildDataSourceOptions(env)).initialize();
  try {
    await runSeed(ds, {
      ADMIN_EMAIL: env.ADMIN_EMAIL,
      ADMIN_PASSWORD: env.ADMIN_PASSWORD,
      LICENSE_ENC_KEY: env.LICENSE_ENC_KEY,
    });
    console.log('Seed aplicado');
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
