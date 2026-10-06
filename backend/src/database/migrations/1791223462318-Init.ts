import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1791223462318 implements MigrationInterface {
    name = 'Init1791223462318'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorId" uuid, "action" character varying NOT NULL, "entity" character varying NOT NULL, "entityId" character varying NOT NULL, "meta" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2643f2a68c662985433dbddca1" ON "audit_logs" ("entity", "entityId") `);
        await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, CONSTRAINT "UQ_8b0be371d28245da6e4f4b61878" UNIQUE ("name"), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "description" text, "active" boolean NOT NULL DEFAULT true, "categoryId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_464f927ae360106b783ed0b4106" UNIQUE ("slug"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."plans_kind_enum" AS ENUM('NEW', 'RENEWAL')`);
        await queryRunner.query(`CREATE TABLE "plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "productId" uuid NOT NULL, "name" character varying NOT NULL, "kind" "public"."plans_kind_enum" NOT NULL DEFAULT 'NEW', "durationDays" integer NOT NULL, "priceCents" integer NOT NULL, "lowStockThreshold" integer NOT NULL DEFAULT '5', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_3720521a81c7c24fe9b7202ba61" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "license_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "planId" uuid NOT NULL, "supplier" character varying, "unitCostCents" integer NOT NULL, "notes" text, "purchasedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f20e36f3bf990a37bce68ac7dbd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('CUSTOMER', 'ADMIN')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "name" character varying, "role" "public"."users_role_enum" NOT NULL DEFAULT 'CUSTOMER', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."payments_method_enum" AS ENUM('YAPE_PLIN', 'BANK_TRANSFER')`);
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "method" "public"."payments_method_enum" NOT NULL, "proofUrl" character varying NOT NULL, "status" "public"."payments_status_enum" NOT NULL DEFAULT 'PENDING', "rejectionReason" character varying, "reviewedById" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_32b41cdb985a296213e9a928b5" ON "payments" ("status") `);
        await queryRunner.query(`CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING_PAYMENT', 'IN_REVIEW', 'DELIVERED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDING_PAYMENT', "totalCents" integer NOT NULL, "toolUsername" character varying, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a827e8437c6ddac993842cc32f" ON "orders" ("status", "expiresAt") `);
        await queryRunner.query(`CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "planId" uuid NOT NULL, "unitPriceCents" integer NOT NULL, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."license_items_status_enum" AS ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'VOID')`);
        await queryRunner.query(`CREATE TABLE "license_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "planId" uuid NOT NULL, "batchId" uuid NOT NULL, "secretEncrypted" text NOT NULL, "secretHash" character varying NOT NULL, "status" "public"."license_items_status_enum" NOT NULL DEFAULT 'AVAILABLE', "reservedUntil" TIMESTAMP WITH TIME ZONE, "orderItemId" uuid, "soldAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_865d22e8f79a7facf23f17643d0" UNIQUE ("secretHash"), CONSTRAINT "UQ_436c66d0a31e2891af9131c0aec" UNIQUE ("orderItemId"), CONSTRAINT "REL_436c66d0a31e2891af9131c0ae" UNIQUE ("orderItemId"), CONSTRAINT "PK_909a6be6662b122905a6c90a6b1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f1f635ad739427314ae8b61f22" ON "license_items" ("planId", "status") `);
        await queryRunner.query(`CREATE TYPE "public"."claims_status_enum" AS ENUM('OPEN', 'RESOLVED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "claims" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "licenseItemId" uuid NOT NULL, "userId" uuid NOT NULL, "reason" text NOT NULL, "status" "public"."claims_status_enum" NOT NULL DEFAULT 'OPEN', "replacementLicenseId" uuid, "resolvedById" uuid, "resolvedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_96c91970c0dcb2f69fdccd0a698" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_78214f7ed47cfd76fb8bf6bb28" ON "claims" ("status") `);
        await queryRunner.query(`CREATE TABLE "notification_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying NOT NULL, "channel" character varying NOT NULL, "recipient" character varying NOT NULL, "template" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_2a46b5ff8b270c1e27069acc1c4" UNIQUE ("key"), CONSTRAINT "PK_19c524e644cdeaebfcffc284871" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_ff56834e735fa78a15d0cf21926" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "plans" ADD CONSTRAINT "FK_dd77a65c3fe0c09e54fc156b14b" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "license_batches" ADD CONSTRAINT "FK_dce3360f050878e9aa0f1fe9b3f" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_af929a5f2a400fdb6913b4967e1" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_3d551985257fea1d55ffc3b01d3" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_8af2964ba8b82fc6a7abc21faf9" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "license_items" ADD CONSTRAINT "FK_09615cdba0b4fccdc50838c26e5" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "license_items" ADD CONSTRAINT "FK_91ba160ac36559edfe25d3fa03b" FOREIGN KEY ("batchId") REFERENCES "license_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "license_items" ADD CONSTRAINT "FK_436c66d0a31e2891af9131c0aec" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "claims" ADD CONSTRAINT "FK_e151a09dba65dd96aa13f885219" FOREIGN KEY ("licenseItemId") REFERENCES "license_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "claims" ADD CONSTRAINT "FK_299a3ed5259cccd5cf541512e73" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "claims" ADD CONSTRAINT "FK_1cb38ed423c5937d1aabe61f3f7" FOREIGN KEY ("replacementLicenseId") REFERENCES "license_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "claims" ADD CONSTRAINT "FK_41786b87da7bd62cbe7b45de93c" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "claims" DROP CONSTRAINT "FK_41786b87da7bd62cbe7b45de93c"`);
        await queryRunner.query(`ALTER TABLE "claims" DROP CONSTRAINT "FK_1cb38ed423c5937d1aabe61f3f7"`);
        await queryRunner.query(`ALTER TABLE "claims" DROP CONSTRAINT "FK_299a3ed5259cccd5cf541512e73"`);
        await queryRunner.query(`ALTER TABLE "claims" DROP CONSTRAINT "FK_e151a09dba65dd96aa13f885219"`);
        await queryRunner.query(`ALTER TABLE "license_items" DROP CONSTRAINT "FK_436c66d0a31e2891af9131c0aec"`);
        await queryRunner.query(`ALTER TABLE "license_items" DROP CONSTRAINT "FK_91ba160ac36559edfe25d3fa03b"`);
        await queryRunner.query(`ALTER TABLE "license_items" DROP CONSTRAINT "FK_09615cdba0b4fccdc50838c26e5"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_8af2964ba8b82fc6a7abc21faf9"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_3d551985257fea1d55ffc3b01d3"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_af929a5f2a400fdb6913b4967e1"`);
        await queryRunner.query(`ALTER TABLE "license_batches" DROP CONSTRAINT "FK_dce3360f050878e9aa0f1fe9b3f"`);
        await queryRunner.query(`ALTER TABLE "plans" DROP CONSTRAINT "FK_dd77a65c3fe0c09e54fc156b14b"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_ff56834e735fa78a15d0cf21926"`);
        await queryRunner.query(`DROP TABLE "notification_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_78214f7ed47cfd76fb8bf6bb28"`);
        await queryRunner.query(`DROP TABLE "claims"`);
        await queryRunner.query(`DROP TYPE "public"."claims_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f1f635ad739427314ae8b61f22"`);
        await queryRunner.query(`DROP TABLE "license_items"`);
        await queryRunner.query(`DROP TYPE "public"."license_items_status_enum"`);
        await queryRunner.query(`DROP TABLE "order_items"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a827e8437c6ddac993842cc32f"`);
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_32b41cdb985a296213e9a928b5"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "license_batches"`);
        await queryRunner.query(`DROP TABLE "plans"`);
        await queryRunner.query(`DROP TYPE "public"."plans_kind_enum"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2643f2a68c662985433dbddca1"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
    }

}
