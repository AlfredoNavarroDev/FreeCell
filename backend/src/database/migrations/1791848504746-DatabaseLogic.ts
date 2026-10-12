import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tablas con columna "updatedAt" que mantiene el trigger trg_set_updated_at. */
const UPDATED_AT_TABLES = [
  'users',
  'categories',
  'products',
  'plans',
  'plan_prices',
  'license_batches',
  'license_items',
  'orders',
  'payment_methods',
  'payments',
  'claims',
  'support_tickets',
  'reviews',
  'settings',
];

/**
 * Lógica en base de datos como defensa en profundidad (D57): aunque un servicio tenga un bug,
 * Postgres no deja revender una licencia, saltar estados ni editar la auditoría.
 */
export class DatabaseLogic1791848504746 implements MigrationInterface {
  name = 'DatabaseLogic1791848504746';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Números de pedido legibles desde #1001 (también tras TRUNCATE ... RESTART IDENTITY).
    await queryRunner.query(`
      DO $$ BEGIN
        EXECUTE format('ALTER SEQUENCE %s START WITH 1001 RESTART WITH 1001',
                       pg_get_serial_sequence('orders', 'orderNumber'));
      END $$;
    `);

    // 1. updatedAt también para SQL directo (seed, funciones, scripts).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW."updatedAt" := now();
        RETURN NEW;
      END $$;
    `);
    for (const table of UPDATED_AT_TABLES) {
      await queryRunner.query(
        `CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "${table}" FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()`,
      );
    }

    // 2. Transiciones válidas de licencia (regla 1).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_license_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = OLD.status THEN
          RETURN NEW;
        END IF;
        IF (OLD.status::text || '->' || NEW.status::text) IN (
          'AVAILABLE->RESERVED', 'RESERVED->AVAILABLE', 'RESERVED->SOLD', 'SOLD->VOID', 'AVAILABLE->VOID'
        ) THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Transición de licencia no permitida: % -> %', OLD.status, NEW.status
          USING ERRCODE = 'P0001';
      END $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_license_status_guard BEFORE UPDATE OF status ON license_items
      FOR EACH ROW EXECUTE FUNCTION fn_license_status_guard()
    `);

    // 3. Máquina de estados del pedido (docs/04).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_order_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = OLD.status THEN
          RETURN NEW;
        END IF;
        IF (OLD.status::text || '->' || NEW.status::text) IN (
          'PENDING_PAYMENT->IN_REVIEW', 'PENDING_PAYMENT->CANCELLED',
          'IN_REVIEW->DELIVERED', 'IN_REVIEW->PENDING_ACTIVATION', 'IN_REVIEW->PENDING_PAYMENT', 'IN_REVIEW->CANCELLED',
          'PENDING_ACTIVATION->DELIVERED'
        ) THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Transición de pedido no permitida: % -> %', OLD.status, NEW.status
          USING ERRCODE = 'P0001';
      END $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_order_status_guard BEFORE UPDATE OF status ON orders
      FOR EACH ROW EXECUTE FUNCTION fn_order_status_guard()
    `);

    // 4. totalCents = suma de líneas, verificado al hacer COMMIT (invariante 5).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_order_total_check() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        v_order uuid;
        v_total int;
        v_sum bigint;
      BEGIN
        IF TG_TABLE_NAME = 'orders' THEN
          v_order := NEW.id;
        ELSIF TG_OP = 'DELETE' THEN
          v_order := OLD."orderId";
        ELSE
          v_order := NEW."orderId";
        END IF;

        SELECT "totalCents" INTO v_total FROM orders WHERE id = v_order;
        IF NOT FOUND THEN
          RETURN NULL;
        END IF;

        SELECT COALESCE(SUM("unitPriceCents"), 0) INTO v_sum FROM order_items WHERE "orderId" = v_order;
        IF v_sum <> v_total THEN
          RAISE EXCEPTION 'El total del pedido % no coincide con sus líneas', v_order USING ERRCODE = 'P0001';
        END IF;
        RETURN NULL;
      END $$;
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER trg_order_total_check
      AFTER INSERT OR UPDATE OF "totalCents" ON orders
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_order_total_check()
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER trg_order_items_total_check
      AFTER INSERT OR UPDATE OR DELETE ON order_items
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_order_total_check()
    `);

    // 5. audit_logs es de solo inserción.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs es de solo inserción' USING ERRCODE = 'P0001';
      END $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION fn_audit_logs_immutable()
    `);

    // 6. El método de pago debe estar activo y aceptar la moneda del pedido (D63).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_payment_method_currency() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        v_currency char(3);
        v_ok boolean;
      BEGIN
        SELECT o.currency INTO v_currency FROM orders o WHERE o.id = NEW."orderId";
        SELECT (pm.active AND v_currency = ANY (pm.currencies)) INTO v_ok
          FROM payment_methods pm WHERE pm.id = NEW."paymentMethodId";
        IF v_ok IS NOT TRUE THEN
          RAISE EXCEPTION 'Método de pago no válido para la moneda %', v_currency USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_payment_method_currency BEFORE INSERT OR UPDATE OF "paymentMethodId" ON payments
      FOR EACH ROW EXECUTE FUNCTION fn_payment_method_currency()
    `);

    // Vistas de solo lectura. Ninguna expone secretEncrypted ni secretHash.
    await queryRunner.query(`
      CREATE VIEW v_plan_stock AS
      SELECT
        p.id AS "planId",
        (COUNT(li.id) FILTER (WHERE li.status = 'AVAILABLE'))::int AS available,
        (COUNT(li.id) FILTER (WHERE li.status = 'RESERVED'))::int AS reserved,
        (COUNT(li.id) FILTER (WHERE li.status = 'SOLD'))::int AS sold,
        (COUNT(li.id) FILTER (WHERE li.status = 'VOID'))::int AS "void",
        CASE
          WHEN COUNT(li.id) FILTER (WHERE li.status = 'AVAILABLE') = 0 THEN 'OUT_OF_STOCK'
          WHEN COUNT(li.id) FILTER (WHERE li.status = 'AVAILABLE') <= p."lowStockThreshold" THEN 'LOW'
          ELSE 'IN_STOCK'
        END AS "stockState"
      FROM plans p
      LEFT JOIN license_items li ON li."planId" = p.id
      GROUP BY p.id
    `);
    await queryRunner.query(`
      CREATE VIEW v_sales_lines AS
      SELECT
        o.id AS "orderId",
        oi.id AS "orderItemId",
        oi."planId",
        pl."productId",
        o.currency,
        oi."unitPriceCents",
        b."costCurrency",
        b."unitCostCents",
        b."fxRatePen",
        CASE
          WHEN o.currency = b."costCurrency" THEN oi."unitPriceCents" - b."unitCostCents"
          WHEN o.currency = 'PEN' AND b."costCurrency" = 'USD'
            THEN oi."unitPriceCents" - ROUND(b."unitCostCents" * b."fxRatePen")::int
          ELSE NULL
        END AS "marginCents",
        li."soldAt"
      FROM license_items li
      JOIN order_items oi ON oi.id = li."orderItemId"
      JOIN orders o ON o.id = oi."orderId"
      JOIN plans pl ON pl.id = oi."planId"
      JOIN license_batches b ON b.id = li."batchId"
      WHERE li.status = 'SOLD'
    `);

    // Liberación idempotente: única implementación para job, barrido y cancelación del cliente.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_release_order(p_order_id uuid, p_reason text, p_require_expired boolean)
      RETURNS boolean LANGUAGE plpgsql AS $$
      DECLARE
        v_order orders%ROWTYPE;
      BEGIN
        SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
        IF NOT FOUND OR v_order.status <> 'PENDING_PAYMENT' THEN
          RETURN false;
        END IF;
        IF p_require_expired AND v_order."expiresAt" > now() THEN
          RETURN false;
        END IF;

        UPDATE license_items li
           SET status = 'AVAILABLE', "orderItemId" = NULL, "reservedUntil" = NULL
          FROM order_items oi
         WHERE oi."orderId" = p_order_id AND li."orderItemId" = oi.id AND li.status = 'RESERVED';

        UPDATE orders SET status = 'CANCELLED', "cancelReason" = p_reason WHERE id = p_order_id;
        RETURN true;
      END $$;
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_release_expired() RETURNS SETOF uuid LANGUAGE plpgsql AS $$
      DECLARE
        r record;
      BEGIN
        FOR r IN
          SELECT id FROM orders
           WHERE status = 'PENDING_PAYMENT' AND "expiresAt" <= now()
           ORDER BY "expiresAt"
           LIMIT 500
           FOR UPDATE SKIP LOCKED
        LOOP
          IF fn_release_order(r.id, 'EXPIRED', true) THEN
            RETURN NEXT r.id;
          END IF;
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_release_expired()`);
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_release_order(uuid, text, boolean)`,
    );
    await queryRunner.query(`DROP VIEW IF EXISTS v_sales_lines`);
    await queryRunner.query(`DROP VIEW IF EXISTS v_plan_stock`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_payment_method_currency ON payments`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_payment_method_currency()`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_audit_logs_immutable()`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_order_items_total_check ON order_items`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_order_total_check ON orders`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_order_total_check()`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_order_status_guard ON orders`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_order_status_guard()`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_license_status_guard ON license_items`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_license_status_guard()`,
    );
    for (const table of UPDATED_AT_TABLES) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS trg_set_updated_at ON "${table}"`,
      );
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_set_updated_at()`);
    await queryRunner.query(`
      DO $$ BEGIN
        EXECUTE format('ALTER SEQUENCE %s START WITH 1 RESTART WITH 1',
                       pg_get_serial_sequence('orders', 'orderNumber'));
      END $$;
    `);
  }
}
