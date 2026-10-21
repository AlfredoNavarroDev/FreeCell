import { Module } from '@nestjs/common';
import { CategoriesAdminController } from './categories-admin.controller';
import { CategoriesAdminService } from './categories-admin.service';
import { PlansAdminController } from './plans-admin.controller';
import { PlansAdminService } from './plans-admin.service';
import { ProductsAdminController } from './products-admin.controller';
import { ProductsAdminService } from './products-admin.service';

@Module({
  controllers: [
    CategoriesAdminController,
    ProductsAdminController,
    PlansAdminController,
  ],
  providers: [CategoriesAdminService, ProductsAdminService, PlansAdminService],
})
export class CatalogAdminModule {}
