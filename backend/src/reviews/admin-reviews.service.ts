import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ReviewStatus } from '../database/enums';
import {
  AdminReviewResponseDto,
  ReviewActionResultDto,
} from './dto/admin-review-response.dto';
import { ListAdminReviewsQueryDto } from './dto/list-admin-reviews-query.dto';

@Injectable()
export class AdminReviewsService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Cola de moderación: la más antigua primero (igual que reclamos). */
  async list(
    dto: ListAdminReviewsQueryDto,
  ): Promise<PaginatedResponseDto<AdminReviewResponseDto>> {
    const offset = (dto.page - 1) * dto.pageSize;
    const rows: AdminReviewResponseDto[] = await this.ds.query(
      `SELECT r.id AS "reviewId", r.status, r.rating, r.body, pr.name AS "productName",
              o."orderNumber", u.name AS "customerName", u.email AS "customerEmail",
              r."createdAt"
         FROM reviews r
         JOIN products pr ON pr.id = r."productId"
         JOIN orders o ON o.id = r."orderId"
         JOIN users u ON u.id = r."userId"
        WHERE ($1::text IS NULL OR r.status::text = $1)
        ORDER BY r."createdAt" ASC, r.id
        LIMIT $2 OFFSET $3`,
      [dto.status ?? null, dto.pageSize, offset],
    );
    const [{ count }]: { count: string }[] = await this.ds.query(
      `SELECT count(*) FROM reviews WHERE ($1::text IS NULL OR status::text = $1)`,
      [dto.status ?? null],
    );
    return PaginatedResponseDto.from(
      rows,
      Number(count),
      dto.page,
      dto.pageSize,
    );
  }

  approve(
    admin: AuthenticatedUser,
    id: string,
  ): Promise<ReviewActionResultDto> {
    return this.moderate(admin, id, ReviewStatus.APPROVED, 'review.approved');
  }

  hide(admin: AuthenticatedUser, id: string): Promise<ReviewActionResultDto> {
    return this.moderate(admin, id, ReviewStatus.HIDDEN, 'review.hidden');
  }

  /** Cualquier cambio entre los tres estados es válido salvo repetir el actual (409). El FOR UPDATE
   * serializa moderaciones simultáneas de la misma reseña. */
  private async moderate(
    admin: AuthenticatedUser,
    id: string,
    target: ReviewStatus,
    action: string,
  ): Promise<ReviewActionResultDto> {
    return this.ds.transaction(async (m) => {
      const rows: { status: ReviewStatus }[] = await m.query(
        `SELECT status FROM reviews WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const current = rows[0]?.status;
      if (!current) {
        throw new NotFoundException('Reseña no encontrada');
      }
      if (current === target) {
        throw new ConflictException('La reseña ya tiene ese estado');
      }

      await m.query(`UPDATE reviews SET status = $2 WHERE id = $1`, [
        id,
        target,
      ]);
      await this.audit.log(m, {
        actorId: admin.id,
        action,
        entity: 'review',
        entityId: id,
        meta: { previousStatus: current },
      });
      return { reviewId: id, status: target };
    });
  }
}
