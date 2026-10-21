import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductAdminResponseDto } from './dto/product-admin-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsAdminService } from './products-admin.service';

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/products')
export class ProductsAdminController {
  constructor(private readonly products: ProductsAdminService) {}

  @Get()
  list(): Promise<ProductAdminResponseDto[]> {
    return this.products.list();
  }

  @Post()
  create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ): Promise<ProductAdminResponseDto> {
    return this.products.create(admin, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductAdminResponseDto> {
    return this.products.update(admin, id, dto);
  }
}
