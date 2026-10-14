import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { OrderStatus, PaymentMethodKind } from '../src/database/enums';
import { TEST_DATABASE_URL } from './setup-env';
import {
  createCatalog,
  createPaymentMethod,
  createUser,
  insertOrder,
  truncateAll,
} from './utils/factories';

describe('Lógica en base de datos (D57)', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await new DataSource(
      buildDataSourceOptions({
        DATABASE_URL: TEST_DATABASE_URL,
        DB_SSL: false,
      }),
    ).initialize();
  });

  beforeEach(async () => {
    await truncateAll(ds);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('numera los pedidos desde 1001', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: plan.id, unitPriceCents: 1000 }],
    });
    const [row]: { orderNumber: number }[] = await ds.query(
      `SELECT "orderNumber" FROM orders WHERE id = $1`,
      [orderId],
    );
    expect(row.orderNumber).toBe(1001);
  });

  it('impide revender una licencia vendida (SOLD -> AVAILABLE)', async () => {
    const user = await createUser(ds);
    const { plan, licenseIds } = await createCatalog(ds, { stock: 1 });
    await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [
        { planId: plan.id, unitPriceCents: 1000, licenseId: licenseIds[0] },
      ],
    });
    await ds.query(
      `UPDATE license_items SET status = 'SOLD', "soldAt" = now() WHERE id = $1`,
      [licenseIds[0]],
    );

    await expect(
      ds.query(
        `UPDATE license_items SET status = 'AVAILABLE', "orderItemId" = NULL, "reservedUntil" = NULL WHERE id = $1`,
        [licenseIds[0]],
      ),
    ).rejects.toThrow(/Transición de licencia no permitida/);
  });

  it('impide saltar estados del pedido (CANCELLED -> DELIVERED)', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: plan.id, unitPriceCents: 1000 }],
    });
    await ds.query(`UPDATE orders SET status = 'CANCELLED' WHERE id = $1`, [
      orderId,
    ]);
    await expect(
      ds.query(`UPDATE orders SET status = 'DELIVERED' WHERE id = $1`, [
        orderId,
      ]),
    ).rejects.toThrow(/Transición de pedido no permitida/);
  });

  it('rechaza al hacer COMMIT un pedido cuyo total no cuadra con sus líneas', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    await expect(
      insertOrder(ds, {
        userId: user.id,
        currency: 'PEN',
        totalCents: 999,
        lines: [{ planId: plan.id, unitPriceCents: 1000 }],
      }),
    ).rejects.toThrow(/no coincide con sus líneas/);
    const [{ count }]: { count: string }[] = await ds.query(
      `SELECT count(*) FROM orders`,
    );
    expect(Number(count)).toBe(0);
  });

  it('no deja modificar ni borrar audit_logs', async () => {
    await ds.query(
      `INSERT INTO audit_logs (action, entity, "entityId") VALUES ('test.action', 'test', 'x') RETURNING id`,
    );
    await expect(
      ds.query(`UPDATE audit_logs SET action = 'otro'`),
    ).rejects.toThrow(/solo inserción/);
    await expect(ds.query(`DELETE FROM audit_logs`)).rejects.toThrow(
      /solo inserción/,
    );
  });

  it('rechaza monedas fuera de PEN/USD', async () => {
    const { plan } = await createCatalog(ds);
    await expect(
      ds.query(
        `INSERT INTO plan_prices ("planId", currency, "priceCents") VALUES ($1, 'EUR', 100)`,
        [plan.id],
      ),
    ).rejects.toThrow(/CHK_plan_prices_currency/);
  });

  it('exige fxRatePen en lotes en USD', async () => {
    const { plan } = await createCatalog(ds, { stock: 0 });
    await expect(
      ds.query(
        `INSERT INTO license_batches ("planId", "unitCostCents", "costCurrency", "fxRatePen") VALUES ($1, 200, 'USD', NULL)`,
        [plan.id],
      ),
    ).rejects.toThrow(/CHK_license_batches_fx/);
  });

  it('rechaza un método CRYPTO que acepte soles', async () => {
    await expect(
      createPaymentMethod(ds, {
        kind: PaymentMethodKind.CRYPTO,
        currencies: ['PEN'],
      }),
    ).rejects.toThrow(/CHK_payment_methods_crypto_usd/);
  });

  describe('método de pago según moneda (trg_payment_method_currency)', () => {
    async function pendingOrder(currency: 'PEN' | 'USD') {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds, {
        prices: { PEN: 1000, USD: 300 },
      });
      const { orderId } = await insertOrder(ds, {
        userId: user.id,
        currency,
        lines: [
          { planId: plan.id, unitPriceCents: currency === 'PEN' ? 1000 : 300 },
        ],
      });
      return orderId;
    }

    const insertPayment = (
      orderId: string,
      methodId: string,
      operation: string,
    ) =>
      ds.query(
        `INSERT INTO payments ("orderId", "paymentMethodId", "operationNumber", "proofKey", "proofHash")
         VALUES ($1, $2, $3, 'proofs/x.png', md5(random()::text) || md5(random()::text))`,
        [orderId, methodId, operation],
      );

    it('rechaza un método CRYPTO en un pedido en soles', async () => {
      const orderId = await pendingOrder('PEN');
      const crypto = await createPaymentMethod(ds, {
        kind: PaymentMethodKind.CRYPTO,
        currencies: ['USD'],
      });
      await expect(insertPayment(orderId, crypto.id, 'op-1')).rejects.toThrow(
        /Método de pago no válido/,
      );
    });

    it('rechaza un método inactivo', async () => {
      const orderId = await pendingOrder('PEN');
      const wallet = await createPaymentMethod(ds, { active: false });
      await expect(insertPayment(orderId, wallet.id, 'op-1')).rejects.toThrow(
        /Método de pago no válido/,
      );
    });

    it('acepta el mismo N.º de operación en métodos distintos (D64)', async () => {
      const orderA = await pendingOrder('PEN');
      const orderB = await pendingOrder('PEN');
      const yape = await createPaymentMethod(ds);
      const plin = await createPaymentMethod(ds);
      await insertPayment(orderA, yape.id, '123456');
      await expect(
        insertPayment(orderB, plin.id, '123456'),
      ).resolves.toBeDefined();
      await expect(insertPayment(orderB, yape.id, '123456')).rejects.toThrow(
        /UQ_payments_method_operation|duplicate/,
      );
    });
  });

  it('v_plan_stock cuenta por estado y calcula stockState', async () => {
    const user = await createUser(ds);
    const { plan, licenseIds } = await createCatalog(ds, {
      stock: 3,
      lowStockThreshold: 2,
    });
    await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [
        { planId: plan.id, unitPriceCents: 1000, licenseId: licenseIds[0] },
      ],
    });
    const [row]: { available: number; reserved: number; stockState: string }[] =
      await ds.query(
        `SELECT available, reserved, "stockState" FROM v_plan_stock WHERE "planId" = $1`,
        [plan.id],
      );
    expect(row).toEqual({ available: 2, reserved: 1, stockState: 'LOW' });
  });

  it('v_sales_lines convierte el costo en USD con la tasa del lote', async () => {
    const user = await createUser(ds);
    const { plan, licenseIds } = await createCatalog(ds, {
      stock: 1,
      prices: { PEN: 1000 },
      costCurrency: 'USD',
      unitCostCents: 200,
      fxRatePen: '3.6200',
    });
    await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [
        { planId: plan.id, unitPriceCents: 1000, licenseId: licenseIds[0] },
      ],
    });
    await ds.query(
      `UPDATE license_items SET status = 'SOLD', "soldAt" = now() WHERE id = $1`,
      [licenseIds[0]],
    );
    const [line]: { marginCents: number }[] = await ds.query(
      `SELECT "marginCents" FROM v_sales_lines`,
    );
    // 1000 − round(200 × 3.62) = 1000 − 724
    expect(line.marginCents).toBe(276);
  });

  describe('fn_release_order', () => {
    it('libera un pedido vencido y devuelve sus licencias', async () => {
      const user = await createUser(ds);
      const { plan, licenseIds } = await createCatalog(ds, { stock: 1 });
      const { orderId } = await insertOrder(ds, {
        userId: user.id,
        currency: 'PEN',
        expiresAt: new Date(Date.now() - 1000),
        lines: [
          { planId: plan.id, unitPriceCents: 1000, licenseId: licenseIds[0] },
        ],
      });

      const [{ released }]: { released: boolean }[] = await ds.query(
        `SELECT fn_release_order($1, 'EXPIRED', true) AS released`,
        [orderId],
      );
      expect(released).toBe(true);

      const [order]: { status: string; cancelReason: string }[] =
        await ds.query(
          `SELECT status, "cancelReason" FROM orders WHERE id = $1`,
          [orderId],
        );
      expect(order).toEqual({ status: 'CANCELLED', cancelReason: 'EXPIRED' });
      const [license]: { status: string; orderItemId: string | null }[] =
        await ds.query(
          `SELECT status, "orderItemId" FROM license_items WHERE id = $1`,
          [licenseIds[0]],
        );
      expect(license).toEqual({ status: 'AVAILABLE', orderItemId: null });
    });

    it('no libera un pedido que aún no vence cuando se exige vencimiento', async () => {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds);
      const { orderId } = await insertOrder(ds, {
        userId: user.id,
        currency: 'PEN',
        lines: [{ planId: plan.id, unitPriceCents: 1000 }],
      });
      const [{ released }]: { released: boolean }[] = await ds.query(
        `SELECT fn_release_order($1, 'EXPIRED', true) AS released`,
        [orderId],
      );
      expect(released).toBe(false);
    });

    it('nunca libera un pedido IN_REVIEW (regla 3)', async () => {
      const user = await createUser(ds);
      const { plan, licenseIds } = await createCatalog(ds, { stock: 1 });
      const { orderId } = await insertOrder(ds, {
        userId: user.id,
        currency: 'PEN',
        status: OrderStatus.IN_REVIEW,
        expiresAt: new Date(Date.now() - 1000),
        lines: [
          { planId: plan.id, unitPriceCents: 1000, licenseId: licenseIds[0] },
        ],
      });
      const [{ released }]: { released: boolean }[] = await ds.query(
        `SELECT fn_release_order($1, 'EXPIRED', true) AS released`,
        [orderId],
      );
      expect(released).toBe(false);
      const [license]: { status: string }[] = await ds.query(
        `SELECT status FROM license_items WHERE id = $1`,
        [licenseIds[0]],
      );
      expect(license.status).toBe('RESERVED');
    });

    it('fn_release_expired libera solo los vencidos', async () => {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds, { stock: 0 });
      const expired = await insertOrder(ds, {
        userId: user.id,
        currency: 'PEN',
        expiresAt: new Date(Date.now() - 1000),
        lines: [{ planId: plan.id, unitPriceCents: 1000 }],
      });
      await insertOrder(ds, {
        userId: user.id,
        currency: 'PEN',
        lines: [{ planId: plan.id, unitPriceCents: 1000 }],
      });

      const rows: { id: string }[] = await ds.query(
        `SELECT fn_release_expired() AS id`,
      );
      expect(rows.map((r) => r.id)).toEqual([expired.orderId]);
    });
  });
});
