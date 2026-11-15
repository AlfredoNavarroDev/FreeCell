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
import { OrderStatus } from '../database/enums';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { ReviewResponseDto } from './dto/review-response.dto';

const REVIEW_COLUMNS = `r.id, r."orderId", r."productId", pr.name AS "productName",
              r.rating, r.body, r.status, r."createdAt"`;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** RF-CAT-10/D33: pedido propio entregado que contenga el producto. El FOR UPDATE sobre el pedido
   * serializa reseñas simultáneas del mismo producto; el trigger de Postgres es la red de seguridad. */
  async create(
    user: AuthenticatedUser,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    const reviewId = await this.ds.transaction(async (m) => {
      const orders: { status: OrderStatus }[] = await m.query(
        `SELECT status FROM orders WHERE id = $1 AND "userId" = $2 FOR UPDATE`,
        [dto.orderId, user.id],
      );
      const order = orders[0];
      if (!order) {
        throw new NotFoundException('Pedido no encontrado');
      }
      if (order.status !== OrderStatus.DELIVERED) {
        throw new ForbiddenException(
          'Solo puedes valorar un producto de un pedido entregado',
        );
      }

      const inOrder: unknown[] = await m.query(
        `SELECT 1
           FROM order_items oi
           JOIN plans pl ON pl.id = oi."planId"
          WHERE oi."orderId" = $1 AND pl."productId" = $2
          LIMIT 1`,
        [dto.orderId, dto.productId],
      );
      if (inOrder.length === 0) {
        throw new ForbiddenException('Ese producto no es parte de este pedido');
      }

      const existing: unknown[] = await m.query(
        `SELECT 1 FROM reviews WHERE "orderId" = $1 AND "productId" = $2`,
        [dto.orderId, dto.productId],
      );
      if (existing.length > 0) {
        throw new ConflictException(
          'Ya valoraste este producto en este pedido',
        );
      }

      const [{ id }]: { id: string }[] = await m.query(
        `INSERT INTO reviews ("productId", "userId", "orderId", rating, body)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [dto.productId, user.id, dto.orderId, dto.rating, dto.body],
      );

      await this.audit.log(m, {
        actorId: user.id,
        action: 'review.created',
        entity: 'review',
        entityId: id,
        meta: {
          orderId: dto.orderId,
          productId: dto.productId,
          rating: dto.rating,
        },
      });
      return id;
    });

    return this.findOne(user.id, reviewId);
  }

  async listForUser(
    userId: string,
    dto: ListReviewsQueryDto,
  ): Promise<PaginatedResponseDto<ReviewResponseDto>> {
    const offset = (dto.page - 1) * dto.pageSize;
    const rows: ReviewResponseDto[] = await this.ds.query(
      `SELECT ${REVIEW_COLUMNS}
         FROM reviews r
         JOIN products pr ON pr.id = r."productId"
        WHERE r."userId" = $1
        ORDER BY r."createdAt" DESC, r.id
        LIMIT $2 OFFSET $3`,
      [userId, dto.pageSize, offset],
    );
    const [{ count }]: { count: string }[] = await this.ds.query(
      `SELECT count(*) FROM reviews WHERE "userId" = $1`,
      [userId],
    );
    return PaginatedResponseDto.from(
      rows,
      Number(count),
      dto.page,
      dto.pageSize,
    );
  }

  private async findOne(
    userId: string,
    reviewId: string,
  ): Promise<ReviewResponseDto> {
    const rows: ReviewResponseDto[] = await this.ds.query(
      `SELECT ${REVIEW_COLUMNS}
         FROM reviews r
         JOIN products pr ON pr.id = r."productId"
        WHERE r.id = $1 AND r."userId" = $2`,
      [reviewId, userId],
    );
    return rows[0];
  }
}
