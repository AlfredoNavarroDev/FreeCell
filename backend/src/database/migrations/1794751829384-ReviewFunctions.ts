import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D33/D57: «solo reseñas reales» se garantiza en Postgres, no solo en NestJS, y el promedio público
 * sale de una vista (mismo patrón que v_plan_stock) para que no pueda desincronizarse.
 */
export class ReviewFunctions1794751829384 implements MigrationInterface {
  name = 'ReviewFunctions1794751829384';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_approved_by_product" ON "reviews" ("productId", "createdAt") WHERE "status" = 'APPROVED'`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_review_requires_delivered()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM orders o
            JOIN order_items oi ON oi."orderId" = o.id
            JOIN plans pl ON pl.id = oi."planId"
           WHERE o.id = NEW."orderId"
             AND o."userId" = NEW."userId"
             AND o.status = 'DELIVERED'
             AND pl."productId" = NEW."productId"
        ) THEN
          RAISE EXCEPTION 'Solo puedes reseñar un producto de un pedido tuyo entregado' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_review_requires_delivered BEFORE INSERT ON reviews
      FOR EACH ROW EXECUTE FUNCTION fn_review_requires_delivered()
    `);

    await queryRunner.query(`
      CREATE VIEW v_product_ratings AS
      SELECT "productId",
             ROUND(AVG(rating)::numeric, 2)::numeric(3,2) AS "ratingAvg",
             COUNT(*)::int AS "ratingCount"
        FROM reviews
       WHERE status = 'APPROVED'
       GROUP BY "productId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS v_product_ratings`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_review_requires_delivered ON reviews`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_review_requires_delivered()`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reviews_approved_by_product"`,
    );
  }
}
