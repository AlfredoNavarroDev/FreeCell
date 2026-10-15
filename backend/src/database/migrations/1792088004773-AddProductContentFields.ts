import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductContentFields1792088004773 implements MigrationInterface {
  name = 'AddProductContentFields1792088004773';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ADD "whatIncluded" text`);
    await queryRunner.query(`ALTER TABLE "products" ADD "compatibility" text`);
    await queryRunner.query(
      `ALTER TABLE "products" ADD "activationGuide" text`,
    );
    await queryRunner.query(`ALTER TABLE "products" ADD "faq" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "faq"`);
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN "activationGuide"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN "compatibility"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN "whatIncluded"`,
    );
  }
}
