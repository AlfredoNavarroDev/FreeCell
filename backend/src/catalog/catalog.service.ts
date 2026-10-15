import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { StockState } from '../database/views/plan-stock.view';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { ProductListItemDto } from './dto/product-list-item.dto';
import { aggregateStockState } from './stock-state.util';

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
        ORDER BY pr.name
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
    );

    const items: ProductListItemDto[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      categoryName: row.categoryName,
      priceFromCents: row.priceFromCents,
      currency: dto.currency,
      stockState: aggregateStockState(stockByProduct.get(row.id) ?? []),
    }));

    return PaginatedResponseDto.from(
      items,
      Number(count),
      dto.page,
      dto.pageSize,
    );
  }

  private async stockStatesByProduct(
    productIds: string[],
  ): Promise<Map<string, StockState[]>> {
    const map = new Map<string, StockState[]>();
    if (productIds.length === 0) return map;

    const rows: { productId: string; stockState: StockState }[] =
      await this.ds.query(
        `SELECT pl."productId", vs."stockState"
           FROM plans pl
           JOIN v_plan_stock vs ON vs."planId" = pl.id
          WHERE pl.active = true AND pl."productId" = ANY($1::uuid[])`,
        [productIds],
      );
    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      list.push(row.stockState);
      map.set(row.productId, list);
    }
    return map;
  }
}
