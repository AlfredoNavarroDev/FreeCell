import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791847860562 implements MigrationInterface {
  name = 'InitialSchema1791847860562';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "actorId" uuid, "action" character varying(80) NOT NULL, "entity" character varying(40) NOT NULL, "entityId" character varying(64) NOT NULL, "meta" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2643f2a68c662985433dbddca1" ON "audit_logs" ("entity", "entityId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(80) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_8b0be371d28245da6e4f4b61878" UNIQUE ("name"), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "plan_prices" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "planId" uuid NOT NULL, "currency" character(3) NOT NULL, "priceCents" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_plan_prices_plan_currency" UNIQUE ("planId", "currency"), CONSTRAINT "CHK_plan_prices_positive" CHECK ("priceCents" > 0), CONSTRAINT "CHK_plan_prices_currency" CHECK ("currency" IN ('PEN', 'USD')), CONSTRAINT "PK_69b05dce9891d42a3d0fc77eec1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(120) NOT NULL, "slug" character varying(140) NOT NULL, "description" text, "active" boolean NOT NULL DEFAULT true, "categoryId" uuid, "requiresToolUsername" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_464f927ae360106b783ed0b4106" UNIQUE ("slug"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."plans_kind_enum" AS ENUM('NEW', 'RENEWAL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "plans" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "productId" uuid NOT NULL, "name" character varying(120) NOT NULL, "kind" "public"."plans_kind_enum" NOT NULL DEFAULT 'NEW', "durationDays" integer NOT NULL, "lowStockThreshold" integer NOT NULL DEFAULT '5', "active" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_plans_low_stock" CHECK ("lowStockThreshold" >= 0), CONSTRAINT "CHK_plans_duration" CHECK ("durationDays" > 0), CONSTRAINT "PK_3720521a81c7c24fe9b7202ba61" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "license_batches" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "planId" uuid NOT NULL, "supplier" character varying(120), "unitCostCents" integer NOT NULL, "costCurrency" character(3) NOT NULL DEFAULT 'USD', "fxRatePen" numeric(10,4), "notes" text, "purchasedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_license_batches_fx" CHECK (("costCurrency" = 'USD' AND "fxRatePen" IS NOT NULL AND "fxRatePen" > 0) OR ("costCurrency" = 'PEN' AND "fxRatePen" IS NULL)), CONSTRAINT "CHK_license_batches_cost" CHECK ("unitCostCents" >= 0), CONSTRAINT "CHK_license_batches_currency" CHECK ("costCurrency" IN ('PEN', 'USD')), CONSTRAINT "PK_f20e36f3bf990a37bce68ac7dbd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('CUSTOMER', 'ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(254) NOT NULL, "passwordHash" character varying, "googleId" character varying(64), "name" character varying(80), "role" "public"."users_role_enum" NOT NULL DEFAULT 'CUSTOMER', "phone" character varying(20), "emailVerifiedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_f382af58ab36057334fb262efd5" UNIQUE ("googleId"), CONSTRAINT "CHK_users_credentials" CHECK ("passwordHash" IS NOT NULL OR "googleId" IS NOT NULL), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING_PAYMENT', 'IN_REVIEW', 'PENDING_ACTIVATION', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "orderNumber" SERIAL NOT NULL, "userId" uuid NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDING_PAYMENT', "totalCents" integer NOT NULL, "currency" character(3) NOT NULL, "toolUsername" character varying(120), "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "cancelReason" character varying(40), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_59b0c3b34ea0fa5562342f24143" UNIQUE ("orderNumber"), CONSTRAINT "CHK_orders_total" CHECK ("totalCents" >= 0), CONSTRAINT "CHK_orders_currency" CHECK ("currency" IN ('PEN', 'USD')), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a827e8437c6ddac993842cc32f" ON "orders" ("status", "expiresAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "orderId" uuid NOT NULL, "planId" uuid NOT NULL, "unitPriceCents" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_order_items_price" CHECK ("unitPriceCents" > 0), CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."license_items_status_enum" AS ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'VOID')`,
    );
    await queryRunner.query(
      `CREATE TABLE "license_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "planId" uuid NOT NULL, "batchId" uuid NOT NULL, "secretEncrypted" text NOT NULL, "secretHash" character(64) NOT NULL, "status" "public"."license_items_status_enum" NOT NULL DEFAULT 'AVAILABLE', "reservedUntil" TIMESTAMP WITH TIME ZONE, "orderItemId" uuid, "soldAt" TIMESTAMP WITH TIME ZONE, "replacesId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_865d22e8f79a7facf23f17643d0" UNIQUE ("secretHash"), CONSTRAINT "CHK_license_items_state" CHECK (("status" = 'AVAILABLE' AND "orderItemId" IS NULL AND "reservedUntil" IS NULL) OR ("status" IN ('RESERVED', 'SOLD') AND "orderItemId" IS NOT NULL) OR "status" = 'VOID'), CONSTRAINT "PK_909a6be6662b122905a6c90a6b1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_license_items_active_order_item" ON "license_items" ("orderItemId") WHERE "status" IN ('RESERVED', 'SOLD')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f1f635ad739427314ae8b61f22" ON "license_items" ("planId", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."claims_status_enum" AS ENUM('OPEN', 'RESOLVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "claims" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "orderId" uuid NOT NULL, "licenseItemId" uuid NOT NULL, "userId" uuid NOT NULL, "reason" text NOT NULL, "status" "public"."claims_status_enum" NOT NULL DEFAULT 'OPEN', "replacementLicenseId" uuid, "resolvedById" uuid, "resolvedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_96c91970c0dcb2f69fdccd0a698" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_claims_one_open_per_order" ON "claims" ("orderId") WHERE "status" = 'OPEN'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_78214f7ed47cfd76fb8bf6bb28" ON "claims" ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notification_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "key" character varying(200) NOT NULL, "channel" character varying(20) NOT NULL, "recipient" character varying(254) NOT NULL, "template" character varying(60) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2a46b5ff8b270c1e27069acc1c4" UNIQUE ("key"), CONSTRAINT "PK_19c524e644cdeaebfcffc284871" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_methods_kind_enum" AS ENUM('WALLET', 'BANK_TRANSFER', 'CRYPTO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_methods" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" character varying(40) NOT NULL, "name" character varying(80) NOT NULL, "kind" "public"."payment_methods_kind_enum" NOT NULL, "currencies" character(3) array NOT NULL, "instructions" jsonb NOT NULL DEFAULT '{}'::jsonb, "active" boolean NOT NULL DEFAULT true, "sortOrder" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_f8aad3eab194dfdae604ca11125" UNIQUE ("code"), CONSTRAINT "CHK_payment_methods_crypto_usd" CHECK ("kind" <> 'CRYPTO' OR "currencies" = ARRAY['USD']::char(3)[]), CONSTRAINT "CHK_payment_methods_currencies" CHECK (cardinality("currencies") > 0 AND "currencies" <@ ARRAY['PEN', 'USD']::char(3)[]), CONSTRAINT "PK_34f9b8c6dfb4ac3559f7e2820d1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "orderId" uuid NOT NULL, "paymentMethodId" uuid NOT NULL, "operationNumber" character varying(120) NOT NULL, "proofKey" character varying(255) NOT NULL, "proofHash" character(64) NOT NULL, "status" "public"."payments_status_enum" NOT NULL DEFAULT 'PENDING', "rejectionReason" character varying(200), "reviewedById" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_05f89d41fcb1aca8295368d7838" UNIQUE ("proofHash"), CONSTRAINT "UQ_payments_method_operation" UNIQUE ("paymentMethodId", "operationNumber"), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_payments_one_pending_per_order" ON "payments" ("orderId") WHERE "status" = 'PENDING'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_32b41cdb985a296213e9a928b5" ON "payments" ("status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."refresh_tokens_revokedreason_enum" AS ENUM('ROTATED', 'LOGOUT', 'REUSE_DETECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, "tokenHash" character(64) NOT NULL, "familyId" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "revokedReason" "public"."refresh_tokens_revokedreason_enum", "replacedById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c25bc63d248ca90e8dcc1d92d06" UNIQUE ("tokenHash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_40e9a8b923a1b3fb4429a5c624" ON "refresh_tokens" ("familyId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."reviews_status_enum" AS ENUM('PENDING', 'APPROVED', 'HIDDEN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "reviews" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "productId" uuid NOT NULL, "userId" uuid NOT NULL, "orderId" uuid NOT NULL, "rating" smallint NOT NULL, "body" text NOT NULL, "status" "public"."reviews_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_reviews_order_product" UNIQUE ("orderId", "productId"), CONSTRAINT "CHK_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7b06c23cf52ca8aea0dcaf0ee2" ON "reviews" ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "settings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "key" character varying(80) NOT NULL, "value" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c8639b7626fa94ba8265628f214" UNIQUE ("key"), CONSTRAINT "PK_0669fe20e252eb692bf4d344975" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."support_tickets_status_enum" AS ENUM('OPEN', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "support_tickets" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, "subject" character varying(150) NOT NULL, "status" "public"."support_tickets_status_enum" NOT NULL DEFAULT 'OPEN', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_942e8d8f5df86100471d2324643" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ba7b1a2ed4051fb3b39ff95444" ON "support_tickets" ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ticket_messages" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "ticketId" uuid NOT NULL, "authorId" uuid NOT NULL, "body" text NOT NULL, "isAdmin" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_37beb692dedf7eccb4e519ccec1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_prices" ADD CONSTRAINT "FK_eb2f222f91a8e78e9e1d591b0de" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_ff56834e735fa78a15d0cf21926" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plans" ADD CONSTRAINT "FK_dd77a65c3fe0c09e54fc156b14b" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "license_batches" ADD CONSTRAINT "FK_dce3360f050878e9aa0f1fe9b3f" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_8af2964ba8b82fc6a7abc21faf9" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "license_items" ADD CONSTRAINT "FK_09615cdba0b4fccdc50838c26e5" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "license_items" ADD CONSTRAINT "FK_91ba160ac36559edfe25d3fa03b" FOREIGN KEY ("batchId") REFERENCES "license_batches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "license_items" ADD CONSTRAINT "FK_436c66d0a31e2891af9131c0aec" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "license_items" ADD CONSTRAINT "FK_eedb85d0b51e9d50314eb57225e" FOREIGN KEY ("replacesId") REFERENCES "license_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" ADD CONSTRAINT "FK_84bf3a51e2347e22d4297d32443" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" ADD CONSTRAINT "FK_e151a09dba65dd96aa13f885219" FOREIGN KEY ("licenseItemId") REFERENCES "license_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" ADD CONSTRAINT "FK_299a3ed5259cccd5cf541512e73" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" ADD CONSTRAINT "FK_1cb38ed423c5937d1aabe61f3f7" FOREIGN KEY ("replacementLicenseId") REFERENCES "license_items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" ADD CONSTRAINT "FK_41786b87da7bd62cbe7b45de93c" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_af929a5f2a400fdb6913b4967e1" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_cbe18cae039006a9c217d5a66a6" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_3d551985257fea1d55ffc3b01d3" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_a6b3c434392f5d10ec171043666" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_7ed5659e7139fc8bc039198cc1f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_53a68dc905777554b7f702791fa" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_8679e2ff150ff0e253189ca0253" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket_messages" ADD CONSTRAINT "FK_b01e2a35417efbe04c10828266f" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket_messages" ADD CONSTRAINT "FK_20732d6c17c639f3f155b26cf8b" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ticket_messages" DROP CONSTRAINT "FK_20732d6c17c639f3f155b26cf8b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket_messages" DROP CONSTRAINT "FK_b01e2a35417efbe04c10828266f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP CONSTRAINT "FK_8679e2ff150ff0e253189ca0253"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_53a68dc905777554b7f702791fa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_7ed5659e7139fc8bc039198cc1f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_a6b3c434392f5d10ec171043666"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_610102b60fea1455310ccd299de"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_3d551985257fea1d55ffc3b01d3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_cbe18cae039006a9c217d5a66a6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_af929a5f2a400fdb6913b4967e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_41786b87da7bd62cbe7b45de93c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_1cb38ed423c5937d1aabe61f3f7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_299a3ed5259cccd5cf541512e73"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_e151a09dba65dd96aa13f885219"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_84bf3a51e2347e22d4297d32443"`,
    );
    await queryRunner.query(
      `ALTER TABLE "license_items" DROP CONSTRAINT "FK_eedb85d0b51e9d50314eb57225e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "license_items" DROP CONSTRAINT "FK_436c66d0a31e2891af9131c0aec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "license_items" DROP CONSTRAINT "FK_91ba160ac36559edfe25d3fa03b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "license_items" DROP CONSTRAINT "FK_09615cdba0b4fccdc50838c26e5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_8af2964ba8b82fc6a7abc21faf9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "license_batches" DROP CONSTRAINT "FK_dce3360f050878e9aa0f1fe9b3f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plans" DROP CONSTRAINT "FK_dd77a65c3fe0c09e54fc156b14b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_ff56834e735fa78a15d0cf21926"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_prices" DROP CONSTRAINT "FK_eb2f222f91a8e78e9e1d591b0de"`,
    );
    await queryRunner.query(`DROP TABLE "ticket_messages"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ba7b1a2ed4051fb3b39ff95444"`,
    );
    await queryRunner.query(`DROP TABLE "support_tickets"`);
    await queryRunner.query(`DROP TYPE "public"."support_tickets_status_enum"`);
    await queryRunner.query(`DROP TABLE "settings"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7b06c23cf52ca8aea0dcaf0ee2"`,
    );
    await queryRunner.query(`DROP TABLE "reviews"`);
    await queryRunner.query(`DROP TYPE "public"."reviews_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_40e9a8b923a1b3fb4429a5c624"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(
      `DROP TYPE "public"."refresh_tokens_revokedreason_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_32b41cdb985a296213e9a928b5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_payments_one_pending_per_order"`,
    );
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(`DROP TABLE "payment_methods"`);
    await queryRunner.query(`DROP TYPE "public"."payment_methods_kind_enum"`);
    await queryRunner.query(`DROP TABLE "notification_logs"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_78214f7ed47cfd76fb8bf6bb28"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_claims_one_open_per_order"`,
    );
    await queryRunner.query(`DROP TABLE "claims"`);
    await queryRunner.query(`DROP TYPE "public"."claims_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f1f635ad739427314ae8b61f22"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_license_items_active_order_item"`,
    );
    await queryRunner.query(`DROP TABLE "license_items"`);
    await queryRunner.query(`DROP TYPE "public"."license_items_status_enum"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a827e8437c6ddac993842cc32f"`,
    );
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP TABLE "license_batches"`);
    await queryRunner.query(`DROP TABLE "plans"`);
    await queryRunner.query(`DROP TYPE "public"."plans_kind_enum"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "plan_prices"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2643f2a68c662985433dbddca1"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
