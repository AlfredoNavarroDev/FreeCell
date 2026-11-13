import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../common/crypto/crypto.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { LicenseBatch, LicenseItem } from '../database/entities';
import { LicenseStatus } from '../database/enums';
import { SettingsService, SETTING_USD_PEN_RATE } from '../settings/settings.service';
import type { StockState } from '../database/views/plan-stock.view';
import { AvailableLicenseDto } from './dto/available-license.dto';
import { BatchPreviewDto } from './dto/batch-preview.dto';
import { BatchPreviewResultDto } from './dto/batch-preview-result.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { CreateBatchResultDto } from './dto/create-batch-result.dto';
import { InventoryItemDto, InventoryResponseDto } from './dto/inventory-item.dto';
import { VoidLicenseDto } from './dto/void-license.dto';
import { UpdateUsdRateDto } from './dto/update-usd-rate.dto';

interface SecretCandidate {
  plain: string;
  hash: string;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<InventoryResponseDto> {
    const rows: {
      planId: string;
      productName: string;
      planName: string;
      lowStockThreshold: number;
      available: number;
      reserved: number;
      sold: number;
      stockState: StockState;
    }[] = await this.ds.query(`
      SELECT pl.id AS "planId", pr.name AS "productName", pl.name AS "planName",
             pl."lowStockThreshold", vs.available, vs.reserved, vs.sold, vs."stockState"
        FROM plans pl
        JOIN products pr ON pr.id = pl."productId"
        JOIN v_plan_stock vs ON vs."planId" = pl.id
       ORDER BY pr.name, pl.name
    `);
    const usdPenRate = await this.settings.getNumberOrNull(SETTING_USD_PEN_RATE);
    return { items: rows.map((row) => InventoryItemDto.from(row)), usdPenRate };
  }

  async listAvailableLicenses(planId: string): Promise<AvailableLicenseDto[]> {
    await this.requirePlan(this.ds.manager, planId);
    const rows: { id: string; createdAt: Date }[] = await this.ds.query(
      `SELECT id, "createdAt" FROM license_items
        WHERE "planId" = $1 AND status = $2
        ORDER BY "createdAt" ASC`,
      [planId, LicenseStatus.AVAILABLE],
    );
    return rows.map((row) => ({ id: row.id, createdAt: row.createdAt }));
  }

  async preview(dto: BatchPreviewDto): Promise<BatchPreviewResultDto> {
    await this.requirePlan(this.ds.manager, dto.planId);
    const { valid, duplicateCount, errorCount } = await this.classifySecrets(
      dto.secrets,
      this.ds.manager,
    );
    return { validCount: valid.length, duplicateCount, errorCount };
  }

  async createBatch(
    dto: CreateBatchDto,
    admin: AuthenticatedUser,
  ): Promise<CreateBatchResultDto> {
    return this.ds.transaction(async (m) => {
      await this.requirePlan(m, dto.planId);

      let fxRatePen: string | null = null;
      if (dto.costCurrency === 'USD') {
        const rate = await this.settings.getNumberOrNull(SETTING_USD_PEN_RATE, m);
        if (rate === null) {
          throw new BadRequestException(
            'Configura la tasa USD→PEN antes de cargar un lote en dólares',
          );
        }
        fxRatePen = rate.toFixed(4);
      }

      const { valid, duplicateCount, errorCount } = await this.classifySecrets(
        dto.secrets,
        m,
      );
      if (valid.length === 0) {
        throw new BadRequestException('No se cargó ninguna licencia válida');
      }

      const batch = await m.save(
        LicenseBatch,
        m.create(LicenseBatch, {
          planId: dto.planId,
          supplier: dto.supplier ?? null,
          unitCostCents: dto.unitCostCents,
          costCurrency: dto.costCurrency,
          fxRatePen,
        }),
      );

      for (const candidate of valid) {
        await m.save(
          LicenseItem,
          m.create(LicenseItem, {
            planId: dto.planId,
            batchId: batch.id,
            secretEncrypted: this.crypto.encrypt(candidate.plain),
            secretHash: candidate.hash,
            status: LicenseStatus.AVAILABLE,
          }),
        );
      }

      await this.audit.log(m, {
        actorId: admin.id,
        action: 'license_batch.created',
        entity: 'license_batch',
        entityId: batch.id,
        meta: {
          planId: dto.planId,
          costCurrency: dto.costCurrency,
          unitCostCents: dto.unitCostCents,
          supplier: dto.supplier ?? null,
          loadedCount: valid.length,
          duplicateCount,
          errorCount,
        },
      });

      return {
        batchId: batch.id,
        loadedCount: valid.length,
        duplicateCount,
        errorCount,
      };
    });
  }

  async voidLicense(id: string, dto: VoidLicenseDto, admin: AuthenticatedUser): Promise<void> {
    await this.ds.transaction(async (m) => {
      const license = await m.findOneBy(LicenseItem, { id });
      if (!license) {
        throw new NotFoundException('Licencia no encontrada');
      }
      // Si license.status no es AVAILABLE, trg_license_status_guard bloquea el UPDATE con
      // P0001 y AllExceptionsFilter ya lo traduce a 409 — no se necesita un catch aquí.
      await m.update(LicenseItem, { id }, { status: LicenseStatus.VOID });
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'license_item.voided',
        entity: 'license_item',
        entityId: id,
        meta: { reason: dto.reason, previousStatus: license.status },
      });
    });
  }

  async setUsdRate(rate: number, admin: AuthenticatedUser): Promise<void> {
    await this.settings.setNumber(SETTING_USD_PEN_RATE, rate, admin.id);
  }

  private async requirePlan(manager: EntityManager, planId: string): Promise<void> {
    const rows: { id: string }[] = await manager.query(
      `SELECT id FROM plans WHERE id = $1`,
      [planId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Plan no encontrado');
    }
  }

  /**
   * Dedupe dentro del mismo payload primero, luego contra la base (regla 1, D58).
   * El preview y la carga real comparten esta lógica para que nunca puedan divergir.
   */
  private async classifySecrets(
    secrets: string[],
    manager: EntityManager,
  ): Promise<{ valid: SecretCandidate[]; duplicateCount: number; errorCount: number }> {
    const seen = new Set<string>();
    const candidates: SecretCandidate[] = [];
    let duplicateCount = 0;
    let errorCount = 0;

    for (const raw of secrets) {
      const plain = raw.trim();
      if (!plain) {
        errorCount++;
        continue;
      }
      const hash = this.crypto.hash(plain);
      if (seen.has(hash)) {
        duplicateCount++;
        continue;
      }
      seen.add(hash);
      candidates.push({ plain, hash });
    }

    if (candidates.length === 0) {
      return { valid: [], duplicateCount, errorCount };
    }

    const existing: { secretHash: string }[] = await manager.query(
      `SELECT "secretHash" FROM license_items WHERE "secretHash" = ANY($1::char(64)[])`,
      [candidates.map((c) => c.hash)],
    );
    const existingHashes = new Set(existing.map((e) => e.secretHash));

    const valid: SecretCandidate[] = [];
    for (const candidate of candidates) {
      if (existingHashes.has(candidate.hash)) {
        duplicateCount++;
      } else {
        valid.push(candidate);
      }
    }

    return { valid, duplicateCount, errorCount };
  }
}
