import { hashSync } from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { type DataSource } from 'typeorm';
import { type Currency } from '../../src/database/currency';
import {
  Category,
  LicenseBatch,
  LicenseItem,
  PaymentMethod,
  Plan,
  PlanPrice,
  Product,
  User,
} from '../../src/database/entities';
import {
  LicenseStatus,
  OrderStatus,
  PaymentMethodKind,
  Role,
} from '../../src/database/enums';

export const TEST_PASSWORD = 'Password-123';
// Cost 4: rápido en pruebas. La app usa cost 12.
const TEST_PASSWORD_HASH = hashSync(TEST_PASSWORD, 4);

export async function createUser(
  ds: DataSource,
  overrides: Partial<User> = {},
): Promise<User> {
  const repo = ds.getRepository(User);
  const user = await repo.save(
    repo.create({
      email: `user-${randomUUID()}@test.pe`,
      passwordHash: TEST_PASSWORD_HASH,
      role: Role.CUSTOMER,
      ...overrides,
    }),
  );
  return user;
}

export interface CatalogOptions {
  /** Precio por moneda; por defecto solo PEN 1000. */
  prices?: Partial<Record<Currency, number>>;
  stock?: number;
  requiresToolUsername?: boolean;
  costCurrency?: Currency;
  unitCostCents?: number;
  fxRatePen?: string | null;
  lowStockThreshold?: number;
  planName?: string;
}

export interface Catalog {
  product: Product;
  plan: Plan;
  batch: LicenseBatch;
  licenseIds: string[];
}

export async function createCatalog(
  ds: DataSource,
  options: CatalogOptions = {},
): Promise<Catalog> {
  const suffix = randomUUID().slice(0, 8);
  const category = await ds
    .getRepository(Category)
    .save({ name: `Categoría ${suffix}` });
  const product = await ds.getRepository(Product).save({
    name: `Producto ${suffix}`,
    slug: `producto-${suffix}`,
    description: null,
    categoryId: category.id,
    requiresToolUsername: options.requiresToolUsername ?? false,
  });
  const plan = await ds.getRepository(Plan).save({
    productId: product.id,
    name: options.planName ?? `Plan ${suffix}`,
    durationDays: 30,
    lowStockThreshold: options.lowStockThreshold ?? 5,
  });
  const prices = options.prices ?? { PEN: 1000 };
  for (const [currency, priceCents] of Object.entries(prices)) {
    await ds
      .getRepository(PlanPrice)
      .save({ planId: plan.id, currency: currency as Currency, priceCents });
  }
  const costCurrency = options.costCurrency ?? 'USD';
  const batch = await ds.getRepository(LicenseBatch).save({
    planId: plan.id,
    supplier: null,
    unitCostCents: options.unitCostCents ?? 200,
    costCurrency,
    fxRatePen:
      options.fxRatePen !== undefined
        ? options.fxRatePen
        : costCurrency === 'USD'
          ? '3.6200'
          : null,
    notes: null,
  });
  const licenseIds: string[] = [];
  for (let i = 0; i < (options.stock ?? 5); i++) {
    const row = await ds.getRepository(LicenseItem).save({
      planId: plan.id,
      batchId: batch.id,
      // Las pruebas no descifran: basta un valor opaco y un hash único.
      secretEncrypted: 'test:test:test',
      secretHash: randomBytes(32).toString('hex'),
      status: LicenseStatus.AVAILABLE,
    });
    licenseIds.push(row.id);
  }
  return { product, plan, batch, licenseIds };
}

export async function createPaymentMethod(
  ds: DataSource,
  overrides: Partial<PaymentMethod> = {},
): Promise<PaymentMethod> {
  const repo = ds.getRepository(PaymentMethod);
  return repo.save(
    repo.create({
      code: `pm-${randomUUID().slice(0, 8)}`,
      name: '[Método de prueba]',
      kind: PaymentMethodKind.WALLET,
      currencies: ['PEN'],
      instructions: {},
      ...overrides,
    }),
  );
}

export interface InsertOrderInput {
  userId: string;
  currency: Currency;
  lines: { planId: string; unitPriceCents: number; licenseId?: string }[];
  status?: OrderStatus;
  expiresAt?: Date;
  /** Para probar el trigger de total: si se omite, se usa la suma de las líneas. */
  totalCents?: number;
}

/** Inserta un pedido por SQL, reservando las licencias indicadas, en una transacción. */
export async function insertOrder(
  ds: DataSource,
  input: InsertOrderInput,
): Promise<{ orderId: string }> {
  return ds.transaction(async (m) => {
    const total =
      input.totalCents ??
      input.lines.reduce((sum, l) => sum + l.unitPriceCents, 0);
    const expiresAt = input.expiresAt ?? new Date(Date.now() + 30 * 60_000);
    const [{ id: orderId }]: { id: string }[] = await m.query(
      `INSERT INTO orders ("userId", status, "totalCents", currency, "expiresAt")
       VALUES ($1, 'PENDING_PAYMENT', $2, $3, $4) RETURNING id`,
      [input.userId, total, input.currency, expiresAt],
    );
    for (const line of input.lines) {
      const [{ id: itemId }]: { id: string }[] = await m.query(
        `INSERT INTO order_items ("orderId", "planId", "unitPriceCents") VALUES ($1, $2, $3) RETURNING id`,
        [orderId, line.planId, line.unitPriceCents],
      );
      if (line.licenseId) {
        await m.query(
          `UPDATE license_items SET status = 'RESERVED', "orderItemId" = $1, "reservedUntil" = $2 WHERE id = $3`,
          [itemId, expiresAt, line.licenseId],
        );
      }
    }
    if (input.status && input.status !== OrderStatus.PENDING_PAYMENT) {
      await m.query(`UPDATE orders SET status = $1 WHERE id = $2`, [
        input.status,
        orderId,
      ]);
    }
    return { orderId };
  });
}

/** Vacía todas las tablas excepto migrations (TRUNCATE no dispara el trigger de audit_logs). */
export async function truncateAll(ds: DataSource): Promise<void> {
  const rows: { tablename: string }[] = await ds.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  );
  await ds.query(
    `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
