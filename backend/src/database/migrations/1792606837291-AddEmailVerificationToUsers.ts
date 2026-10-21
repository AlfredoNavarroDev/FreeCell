import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddEmailVerificationToUsers1792606837291 implements MigrationInterface {
  name = 'AddEmailVerificationToUsers1792606837291';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailVerificationTokenHash" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailVerificationExpiresAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "emailVerificationExpiresAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "emailVerificationTokenHash"`,
    );
  }
}
