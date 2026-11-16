import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import type { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import type { CategoryResponseDto } from './dto/category-response.dto';
import type { ProductDetailDto } from './dto/product-detail.dto';
import type { ProductListItemDto } from './dto/product-list-item.dto';
import type { ProductReviewsPageDto } from './dto/product-reviews-response.dto';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  listProducts(
    @Query() query: CatalogQueryDto,
  ): Promise<PaginatedResponseDto<ProductListItemDto>> {
    return this.catalog.listProducts(query);
  }

  @Get('categories')
  listCategories(): Promise<CategoryResponseDto[]> {
    return this.catalog.listCategories();
  }

  @Get('products/:slug')
  getProduct(@Param('slug') slug: string): Promise<ProductDetailDto> {
    return this.catalog.getProductBySlug(slug);
  }

  @Get('products/:slug/reviews')
  listProductReviews(
    @Param('slug') slug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<ProductReviewsPageDto> {
    return this.catalog.listProductReviews(slug, query);
  }
}
