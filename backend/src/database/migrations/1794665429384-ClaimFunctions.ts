import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class ClaimFunctions1794665429384 implements MigrationInterface {
  name = 'ClaimFunctions1794665429384';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "claims" ADD "rejectionReason" text`);

    // RF-ADM-31/D26/D28: repone con una licencia AVAILABLE del mismo plan (SKIP LOCKED); sin stock no toca
    // nada y el reclamo sigue OPEN. La original va a VOID conservando su orderItemId histórico; la nueva
    // toma ese MISMO orderItemId, así POST /orders/:id/license/reveal (ya existe desde S4) la encuentra sin
    // ningún cambio ahí.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_resolve_claim(p_claim_id uuid, p_admin_id uuid)
      RETURNS text LANGUAGE plpgsql AS $$
      DECLARE
        v_claim claims%ROWTYPE;
        v_plan_id uuid;
        v_order_item_id uuid;
        v_new_license_id uuid;
      BEGIN
        SELECT * INTO v_claim FROM claims WHERE id = p_claim_id FOR UPDATE;
        IF NOT FOUND THEN
          RETURN NULL;
        END IF;
        IF v_claim.status <> 'OPEN' THEN
          RAISE EXCEPTION 'El reclamo ya fue resuelto' USING ERRCODE = 'P0001';
        END IF;

        SELECT "planId", "orderItemId" INTO v_plan_id, v_order_item_id
          FROM license_items WHERE id = v_claim."licenseItemId";

        SELECT id INTO v_new_license_id
          FROM license_items
         WHERE "planId" = v_plan_id AND status = 'AVAILABLE'
         ORDER BY "createdAt"
         LIMIT 1
         FOR UPDATE SKIP LOCKED;

        IF v_new_license_id IS NULL THEN
          RETURN 'NO_STOCK';
        END IF;

        UPDATE license_items SET status = 'VOID' WHERE id = v_claim."licenseItemId";
        -- trg_license_status_guard solo permite AVAILABLE->RESERVED->SOLD (no AVAILABLE->SOLD
        -- directo): se pasa por RESERVED en el mismo UPDATE que fija orderItemId para no violar
        -- CHK_license_items_state (RESERVED/SOLD exige orderItemId NOT NULL).
        UPDATE license_items SET status = 'RESERVED', "orderItemId" = v_order_item_id
         WHERE id = v_new_license_id;
        UPDATE license_items
           SET status = 'SOLD', "replacesId" = v_claim."licenseItemId", "soldAt" = now()
         WHERE id = v_new_license_id;

        UPDATE claims
           SET status = 'RESOLVED', "replacementLicenseId" = v_new_license_id,
               "resolvedById" = p_admin_id, "resolvedAt" = now()
         WHERE id = p_claim_id;

        RETURN 'RESOLVED';
      END $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_reject_claim(p_claim_id uuid, p_admin_id uuid, p_reason text)
      RETURNS boolean LANGUAGE plpgsql AS $$
      DECLARE
        v_claim claims%ROWTYPE;
      BEGIN
        SELECT * INTO v_claim FROM claims WHERE id = p_claim_id FOR UPDATE;
        IF NOT FOUND THEN
          RETURN false;
        END IF;
        IF v_claim.status <> 'OPEN' THEN
          RAISE EXCEPTION 'El reclamo ya fue resuelto' USING ERRCODE = 'P0001';
        END IF;

        UPDATE claims SET status = 'REJECTED', "rejectionReason" = p_reason,
          "resolvedById" = p_admin_id, "resolvedAt" = now()
         WHERE id = p_claim_id;
        RETURN true;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_reject_claim(uuid, uuid, text)`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_resolve_claim(uuid, uuid)`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP COLUMN "rejectionReason"`,
    );
  }
}
