import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ClaimStatus, OrderStatus } from '../database/enums';
import { ClaimResponseDto } from './dto/claim-response.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { ListClaimsQueryDto } from './dto/list-claims-query.dto';

const REPLACEMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface ClaimRow {
  id: string;
  orderId: string;
  orderNumber: number;
  status: ClaimStatus;
  reason: string;
  rejectionReason: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

@Injectable()
export class ClaimsService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** RF-REC-01..03: pedido entregado, dentro de la ventana de 7 días (D25), sin reclamo abierto ni
   * reposición ya usada (D26). El lock FOR UPDATE sobre el pedido serializa reclamos concurrentes. */
  async create(
    user: AuthenticatedUser,
    dto: CreateClaimDto,
  ): Promise<ClaimResponseDto> {
    const claimId = await this.ds.transaction(async (m) => {
      const orders: { id: string; status: OrderStatus; updatedAt: Date }[] =
        await m.query(
          `SELECT id, status, "updatedAt" FROM orders WHERE id = $1 AND "userId" = $2 FOR UPDATE`,
          [dto.orderId, user.id],
        );
      const order = orders[0];
      if (!order) {
        throw new NotFoundException('Pedido no encontrado');
      }
      if (order.status !== OrderStatus.DELIVERED) {
        throw new ForbiddenException(
          'Solo puedes reclamar un pedido entregado',
        );
      }
      if (Date.now() - order.updatedAt.getTime() > REPLACEMENT_WINDOW_MS) {
        throw new ConflictException(
          'La ventana de reposición de 7 días ya venció',
        );
      }

      const licenses: { id: string }[] = await m.query(
        `SELECT li.id FROM license_items li
           JOIN order_items oi ON oi.id = li."orderItemId"
          WHERE oi.id = $1 AND oi."orderId" = $2 AND li.status = 'SOLD'`,
        [dto.orderItemId, dto.orderId],
      );
      const license = licenses[0];
      if (!license) {
        throw new NotFoundException(
          'La licencia indicada no es parte de este pedido',
        );
      }

      const existing: { status: ClaimStatus }[] = await m.query(
        `SELECT status FROM claims WHERE "orderId" = $1 AND status IN ('OPEN', 'RESOLVED')`,
        [dto.orderId],
      );
      if (existing.some((c) => c.status === ClaimStatus.OPEN)) {
        throw new ConflictException(
          'Ya hay un reclamo abierto para este pedido',
        );
      }
      if (existing.some((c) => c.status === ClaimStatus.RESOLVED)) {
        throw new ConflictException('Este pedido ya usó su reposición');
      }

      const [{ id }]: { id: string }[] = await m.query(
        `INSERT INTO claims ("orderId", "licenseItemId", "userId", reason, status)
         VALUES ($1, $2, $3, $4, 'OPEN') RETURNING id`,
        [dto.orderId, license.id, user.id, dto.reason],
      );

      await this.audit.log(m, {
        actorId: user.id,
        action: 'claim.created',
        entity: 'claim',
        entityId: id,
        meta: { orderId: dto.orderId, orderItemId: dto.orderItemId },
      });
      return id;
    });

    return this.findOne(user.id, claimId);
  }

  async listForUser(
    userId: string,
    dto: ListClaimsQueryDto,
  ): Promise<PaginatedResponseDto<ClaimResponseDto>> {
    const offset = (dto.page - 1) * dto.pageSize;
    const rows: ClaimRow[] = await this.ds.query(
      `SELECT c.id, c."orderId", o."orderNumber", c.status, c.reason, c."rejectionReason",
              c."createdAt", c."resolvedAt"
         FROM claims c
         JOIN orders o ON o.id = c."orderId"
        WHERE c."userId" = $1
        ORDER BY c."createdAt" DESC
        LIMIT $2 OFFSET $3`,
      [userId, dto.pageSize, offset],
    );
    const [{ count }]: { count: string }[] = await this.ds.query(
      `SELECT count(*) FROM claims WHERE "userId" = $1`,
      [userId],
    );
    return PaginatedResponseDto.from(
      rows.map((row) => this.toResponse(row)),
      Number(count),
      dto.page,
      dto.pageSize,
    );
  }

  private async findOne(
    userId: string,
    claimId: string,
  ): Promise<ClaimResponseDto> {
    const rows: ClaimRow[] = await this.ds.query(
      `SELECT c.id, c."orderId", o."orderNumber", c.status, c.reason, c."rejectionReason",
              c."createdAt", c."resolvedAt"
         FROM claims c
         JOIN orders o ON o.id = c."orderId"
        WHERE c.id = $1 AND c."userId" = $2`,
      [claimId, userId],
    );
    return this.toResponse(rows[0]);
  }

  private toResponse(row: ClaimRow): ClaimResponseDto {
    return {
      id: row.id,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      status: row.status,
      reason: row.reason,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
    };
  }
}
