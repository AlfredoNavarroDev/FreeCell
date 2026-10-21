import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentLegalDeclaration1792549974961 implements MigrationInterface {
    name = 'AddPaymentLegalDeclaration1792549974961'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" ADD "legalDeclarationAcceptedAt" TIMESTAMP WITH TIME ZONE NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "legalDeclarationAcceptedAt"`);
    }

}
