import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ClaimStatus } from '../database/enums';
import {
  AdminClaimResponseDto,
  ClaimActionResultDto,
} from './dto/admin-claim-response.dto';
import { ListAdminClaimsQueryDto } from './dto/list-admin-claims-query.dto';
import { RejectClaimDto } from './dto/reject-claim.dto';

interface AdminClaimRow {
  claimId: string;
  orderId: string;
  orderNumber: number;
  status: ClaimStatus;
  reason: string;
  planId: string;
  productName: string;
  planName: string;
  createdAt: Date;
  customerName: string | null;
  customerEmail: string;
}

@Injectable()
export class AdminClaimsService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(
    dto: ListAdminClaimsQueryDto,
  ): Promise<PaginatedResponseDto<AdminClaimResponseDto>> {
    const offset = (dto.page - 1) * dto.pageSize;
    const rows: AdminClaimRow[] = await this.ds.query(
      `SELECT c.id AS "claimId", c."orderId", o."orderNumber", c.status, c.reason,
              pl.id AS "planId", pl.name AS "planName", pr.name AS "productName",
              c."createdAt", u.name AS "customerName", u.email AS "customerEmail"
         FROM claims c
         JOIN orders o ON o.id = c."orderId"
         JOIN users u ON u.id = c."userId"
         JOIN license_items li ON li.id = c."licenseItemId"
         JOIN plans pl ON pl.id = li."planId"
         JOIN products pr ON pr.id = pl."productId"
        WHERE ($1::text IS NULL OR c.status::text = $1)
        ORDER BY c."createdAt" ASC
        LIMIT $2 OFFSET $3`,
      [dto.status ?? null, dto.pageSize, offset],
    );
    const [{ count }]: { count: string }[] = await this.ds.query(
      `SELECT count(*) FROM claims WHERE ($1::text IS NULL OR status::text = $1)`,
      [dto.status ?? null],
    );

    const planIds = [...new Set(rows.map((row) => row.planId))];
    const stockRows: { planId: string; availableStock: string }[] =
      planIds.length
        ? await this.ds.query(
            `SELECT "planId", count(*) AS "availableStock"
             FROM license_items
            WHERE status = 'AVAILABLE' AND "planId" = ANY($1::uuid[])
            GROUP BY "planId"`,
            [planIds],
          )
        : [];
    const stockByPlan = new Map(
      stockRows.map((row) => [row.planId, Number(row.availableStock)]),
    );

    const items = rows.map((row) => ({
      claimId: row.claimId,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      status: row.status,
      reason: row.reason,
      productName: row.productName,
      planName: row.planName,
      availableStock: stockByPlan.get(row.planId) ?? 0,
      createdAt: row.createdAt,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
    }));
    return PaginatedResponseDto.from(
      items,
      Number(count),
      dto.page,
      dto.pageSize,
    );
  }

  /** RF-ADM-31/D26/D28: repone con una licencia AVAILABLE del mismo plan; sin stock, sigue OPEN. */
  async replace(
    admin: AuthenticatedUser,
    claimId: string,
  ): Promise<ClaimActionResultDto> {
    const result = await this.ds.transaction(async (m) => {
      const rows: { result: string | null }[] = await m.query(
        `SELECT fn_resolve_claim($1, $2) AS result`,
        [claimId, admin.id],
      );
      const outcome = rows[0]?.result ?? null;
      if (outcome === 'RESOLVED') {
        await this.audit.log(m, {
          actorId: admin.id,
          action: 'claim.resolved',
          entity: 'claim',
          entityId: claimId,
        });
      }
      return outcome;
    });

    if (result === null) {
      throw new NotFoundException('Reclamo no encontrado');
    }
    if (result === 'NO_STOCK') {
      throw new ConflictException(
        'Sin stock para reponer; el pedido queda en espera del próximo lote',
      );
    }
    return this.actionResult(claimId);
  }

  /** RF-ADM-32: motivo libre, visible para el cliente en GET /claims. */
  async reject(
    admin: AuthenticatedUser,
    claimId: string,
    dto: RejectClaimDto,
  ): Promise<ClaimActionResultDto> {
    const rejected = await this.ds.transaction(async (m) => {
      const rows: { rejected: boolean }[] = await m.query(
        `SELECT fn_reject_claim($1, $2, $3) AS rejected`,
        [claimId, admin.id, dto.reason],
      );
      const ok = rows[0]?.rejected ?? false;
      if (ok) {
        await this.audit.log(m, {
          actorId: admin.id,
          action: 'claim.rejected',
          entity: 'claim',
          entityId: claimId,
          meta: { reason: dto.reason },
        });
      }
      return ok;
    });

    if (!rejected) {
      throw new NotFoundException('Reclamo no encontrado');
    }
    return this.actionResult(claimId);
  }

  private async actionResult(claimId: string): Promise<ClaimActionResultDto> {
    const rows: {
      claimId: string;
      status: ClaimStatus;
      orderNumber: number;
    }[] = await this.ds.query(
      `SELECT c.id AS "claimId", c.status, o."orderNumber"
           FROM claims c JOIN orders o ON o.id = c."orderId"
          WHERE c.id = $1`,
      [claimId],
    );
    return rows[0];
  }
}
