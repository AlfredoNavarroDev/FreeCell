import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Currency } from '../database/currency';
import type { StockState } from '../database/views/plan-stock.view';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { formatAuthorName } from '../reviews/author-name.util';
import type { CatalogQueryDto } from './dto/catalog-query.dto';
import type { CategoryResponseDto } from './dto/category-response.dto';
import type {
  PlanOfferDto,
  PlanPriceDto,
  ProductDetailDto,
} from './dto/product-detail.dto';
import type { ProductListItemDto } from './dto/product-list-item.dto';
import type { ProductReviewsPageDto } from './dto/product-reviews-response.dto';
import { aggregateStockState } from './stock-state.util';

interface ProductRating {
  ratingAvg: number | null;
  ratingCount: number;
}

const NO_RATING: ProductRating = { ratingAvg: null, ratingCount: 0 };

@Injectable()
export class CatalogService {
  constructor(private readonly ds: DataSource) {}

  async listCategories(): Promise<CategoryResponseDto[]> {
    return this.ds.query(`SELECT id, name FROM categories ORDER BY name`);
  }

  async listProducts(
    dto: CatalogQueryDto,
  ): Promise<PaginatedResponseDto<ProductListItemDto>> {
    const offset = (dto.page - 1) * dto.pageSize;
    const params = [dto.currency, dto.query ?? null, dto.category ?? null];

    const ORDER_BY: Record<string, string> = {
      price_asc: 'MIN(pp."priceCents") ASC, pr.name',
      price_desc: 'MIN(pp."priceCents") DESC, pr.name',
      newest: 'pr."createdAt" DESC, pr.name',
    };
    const orderBy = ORDER_BY[dto.sort ?? ''] ?? 'pr.name';

    const rows: {
      id: string;
      name: string;
      slug: string;
      categoryName: string | null;
      priceFromCents: number;
    }[] = await this.ds.query(
      `SELECT pr.id, pr.name, pr.slug, c.name AS "categoryName",
              MIN(pp."priceCents")::int AS "priceFromCents"
         FROM products pr
         LEFT JOIN categories c ON c.id = pr."categoryId"
         JOIN plans pl ON pl."productId" = pr.id AND pl.active = true
         JOIN plan_prices pp ON pp."planId" = pl.id AND pp.currency = $1
        WHERE pr.active = true
          AND ($2::text IS NULL OR pr.name ILIKE '%' || $2 || '%')
          AND ($3::uuid IS NULL OR pr."categoryId" = $3)
        GROUP BY pr.id, pr.name, pr.slug, c.name
        ORDER BY ${orderBy}
        LIMIT $4 OFFSET $5`,
      [...params, dto.pageSize, offset],
    );

    const [{ count }]: { count: string }[] = await this.ds.query(
      `SELECT COUNT(*) FROM (
         SELECT pr.id
           FROM products pr
           JOIN plans pl ON pl."productId" = pr.id AND pl.active = true
           JOIN plan_prices pp ON pp."planId" = pl.id AND pp.currency = $1
          WHERE pr.active = true
            AND ($2::text IS NULL OR pr.name ILIKE '%' || $2 || '%')
            AND ($3::uuid IS NULL OR pr."categoryId" = $3)
          GROUP BY pr.id
       ) t`,
      params,
    );

    const stockByProduct = await this.stockStatesByProduct(
      rows.map((row) => row.id),
      dto.currency,
    );
    const ratingsByProduct = await this.ratingsByProduct(
      rows.map((row) => row.id),
    );

    const items: ProductListItemDto[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      categoryName: row.categoryName,
      priceFromCents: row.priceFromCents,
      currency: dto.currency,
      stockState: aggregateStockState(stockByProduct.get(row.id) ?? []),
      ...(ratingsByProduct.get(row.id) ?? NO_RATING),
    }));

    return PaginatedResponseDto.from(
      items,
      Number(count),
      dto.page,
      dto.pageSize,
    );
  }

  async getProductBySlug(slug: string): Promise<ProductDetailDto> {
    const [product]: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      whatIncluded: string | null;
      compatibility: string | null;
      activationGuide: string | null;
      faq: { question: string; answer: string }[] | null;
      categoryName: string | null;
      requiresToolUsername: boolean;
    }[] = await this.ds.query(
      `SELECT pr.id, pr.name, pr.slug, pr.description, pr."whatIncluded",
              pr.compatibility, pr."activationGuide", pr.faq,
              c.name AS "categoryName", pr."requiresToolUsername"
         FROM products pr
         LEFT JOIN categories c ON c.id = pr."categoryId"
        WHERE pr.slug = $1 AND pr.active = true`,
      [slug],
    );
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const rows: {
      id: string;
      name: string;
      kind: string;
      durationDays: number;
      stockState: StockState;
      currency: Currency | null;
      priceCents: number | null;
    }[] = await this.ds.query(
      `SELECT pl.id, pl.name, pl.kind, pl."durationDays", vs."stockState",
              pp.currency, pp."priceCents"
         FROM plans pl
         JOIN v_plan_stock vs ON vs."planId" = pl.id
         LEFT JOIN plan_prices pp ON pp."planId" = pl.id
        WHERE pl."productId" = $1 AND pl.active = true
        ORDER BY pl."durationDays", pp.currency`,
      [product.id],
    );

    const plansById = new Map<string, PlanOfferDto>();
    for (const row of rows) {
      const plan = plansById.get(row.id) ?? {
        id: row.id,
        name: row.name,
        kind: row.kind as PlanOfferDto['kind'],
        durationDays: row.durationDays,
        prices: [] as PlanPriceDto[],
        stockState: row.stockState,
      };
      if (row.currency && row.priceCents !== null) {
        plan.prices.push({
          currency: row.currency,
          priceCents: row.priceCents,
        });
      }
      plansById.set(row.id, plan);
    }

    const rating =
      (await this.ratingsByProduct([product.id])).get(product.id) ?? NO_RATING;

    return {
      ...product,
      ...rating,
      plans: [...plansById.values()].filter((plan) => plan.prices.length > 0),
    };
  }

  /** RF-CAT-10: solo reseñas APPROVED, paginadas, la más reciente primero. */
  async listProductReviews(
    slug: string,
    dto: PaginationQueryDto,
  ): Promise<ProductReviewsPageDto> {
    const [product]: { id: string }[] = await this.ds.query(
      `SELECT id FROM products WHERE slug = $1 AND active = true`,
      [slug],
    );
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const offset = (dto.page - 1) * dto.pageSize;
    const rows: {
      id: string;
      rating: number;
      body: string;
      createdAt: Date;
      userName: string | null;
    }[] = await this.ds.query(
      `SELECT r.id, r.rating, r.body, r."createdAt", u.name AS "userName"
         FROM reviews r
         JOIN users u ON u.id = r."userId"
        WHERE r."productId" = $1 AND r.status = 'APPROVED'
        ORDER BY r."createdAt" DESC, r.id
        LIMIT $2 OFFSET $3`,
      [product.id, dto.pageSize, offset],
    );
    const rating =
      (await this.ratingsByProduct([product.id])).get(product.id) ?? NO_RATING;

    return {
      items: rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        body: row.body,
        authorName: formatAuthorName(row.userName),
        createdAt: row.createdAt,
      })),
      total: rating.ratingCount,
      page: dto.page,
      pageSize: dto.pageSize,
      ...rating,
    };
  }

  private async ratingsByProduct(
    productIds: string[],
  ): Promise<Map<string, ProductRating>> {
    const map = new Map<string, ProductRating>();
    if (productIds.length === 0) return map;

    const rows: {
      productId: string;
      ratingAvg: string;
      ratingCount: number;
    }[] = await this.ds.query(
      `SELECT "productId", "ratingAvg", "ratingCount"
           FROM v_product_ratings
          WHERE "productId" = ANY($1::uuid[])`,
      [productIds],
    );
    for (const row of rows) {
      map.set(row.productId, {
        ratingAvg: Number(row.ratingAvg),
        ratingCount: row.ratingCount,
      });
    }
    return map;
  }

  private async stockStatesByProduct(
    productIds: string[],
    currency: Currency,
  ): Promise<Map<string, StockState[]>> {
    const map = new Map<string, StockState[]>();
    if (productIds.length === 0) return map;

    const rows: { productId: string; stockState: StockState }[] =
      await this.ds.query(
        `SELECT pl."productId", vs."stockState"
           FROM plans pl
           JOIN v_plan_stock vs ON vs."planId" = pl.id
           JOIN plan_prices pp ON pp."planId" = pl.id AND pp.currency = $2
          WHERE pl.active = true AND pl."productId" = ANY($1::uuid[])`,
        [productIds, currency],
      );
    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      list.push(row.stockState);
      map.set(row.productId, list);
    }
    return map;
  }
}
