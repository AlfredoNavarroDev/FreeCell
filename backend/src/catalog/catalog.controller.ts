import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { ProductListItemDto } from './dto/product-list-item.dto';
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
}
