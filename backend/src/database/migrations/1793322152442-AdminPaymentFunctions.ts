import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aprobar/rechazar un pago como transacción atómica en Postgres (D57, mismo patrón que
 * fn_release_order de DatabaseLogic): el servicio nunca arma estos pasos a mano, así que un
 * bug en NestJS no puede vender una licencia dos veces ni dejar el pedido en un estado intermedio.
 */
export class AdminPaymentFunctions1793322152442 implements MigrationInterface {
  name = 'AdminPaymentFunctions1793322152442';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_approve_payment(p_payment_id uuid, p_admin_id uuid)
      RETURNS boolean LANGUAGE plpgsql AS $$
      DECLARE
        v_payment payments%ROWTYPE;
      BEGIN
        SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
        IF NOT FOUND THEN
          RETURN false;
        END IF;
        IF v_payment.status = 'APPROVED' THEN
          RETURN true;
        END IF;
        IF v_payment.status <> 'PENDING' THEN
          RAISE EXCEPTION 'El pago ya fue revisado' USING ERRCODE = 'P0001';
        END IF;

        UPDATE payments SET status = 'APPROVED', "reviewedById" = p_admin_id, "reviewedAt" = now()
         WHERE id = p_payment_id;

        UPDATE license_items li SET status = 'SOLD', "soldAt" = now()
          FROM order_items oi
         WHERE oi."orderId" = v_payment."orderId" AND li."orderItemId" = oi.id AND li.status = 'RESERVED';

        UPDATE orders SET status = 'DELIVERED' WHERE id = v_payment."orderId";
        RETURN true;
      END $$;
    `);

    // Devuelve el nuevo estado del pedido ('PENDING_PAYMENT' o 'CANCELLED', D18) o NULL si el pago no existe.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_reject_payment(
        p_payment_id uuid, p_admin_id uuid, p_reason text, p_extra_minutes int
      ) RETURNS text LANGUAGE plpgsql AS $$
      DECLARE
        v_payment payments%ROWTYPE;
        v_rejected_count int;
        v_new_status text;
      BEGIN
        SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR UPDATE;
        IF NOT FOUND THEN
          RETURN NULL;
        END IF;
        IF v_payment.status <> 'PENDING' THEN
          RAISE EXCEPTION 'El pago ya fue revisado' USING ERRCODE = 'P0001';
        END IF;

        UPDATE payments SET status = 'REJECTED', "rejectionReason" = p_reason,
          "reviewedById" = p_admin_id, "reviewedAt" = now()
         WHERE id = p_payment_id;

        SELECT count(*) INTO v_rejected_count FROM payments
         WHERE "orderId" = v_payment."orderId" AND status = 'REJECTED';

        IF v_rejected_count >= 3 THEN
          UPDATE license_items li SET status = 'AVAILABLE', "orderItemId" = NULL, "reservedUntil" = NULL
            FROM order_items oi
           WHERE oi."orderId" = v_payment."orderId" AND li."orderItemId" = oi.id AND li.status = 'RESERVED';
          UPDATE orders SET status = 'CANCELLED', "cancelReason" = 'PAYMENT_REJECTED_LIMIT'
           WHERE id = v_payment."orderId";
          v_new_status := 'CANCELLED';
        ELSE
          UPDATE orders SET status = 'PENDING_PAYMENT', "expiresAt" = now() + make_interval(mins => p_extra_minutes)
           WHERE id = v_payment."orderId";
          v_new_status := 'PENDING_PAYMENT';
        END IF;

        RETURN v_new_status;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_reject_payment(uuid, uuid, text, int)`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_approve_payment(uuid, uuid)`,
    );
  }
}
