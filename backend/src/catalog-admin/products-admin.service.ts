import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Product } from '../database/entities';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductAdminResponseDto } from './dto/product-admin-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsAdminService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ProductAdminResponseDto[]> {
    const rows = await this.ds
      .getRepository(Product)
      .find({ order: { name: 'ASC' } });
    return rows.map((row) => ProductAdminResponseDto.from(row));
  }

  async create(
    admin: AuthenticatedUser,
    dto: CreateProductDto,
  ): Promise<ProductAdminResponseDto> {
    const created = await this.ds.transaction(async (m) => {
      const row = await m.save(
        Product,
        m.create(Product, {
          name: dto.name,
          slug: dto.slug,
          categoryId: dto.categoryId ?? null,
          requiresToolUsername: dto.requiresToolUsername ?? false,
          description: dto.description ?? null,
          active: dto.active ?? true,
        }),
      );
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'product.created',
        entity: 'product',
        entityId: row.id,
        meta: { name: row.name, slug: row.slug },
      });
      return row;
    });
    return ProductAdminResponseDto.from(created);
  }

  async update(
    admin: AuthenticatedUser,
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductAdminResponseDto> {
    const current = await this.ds.getRepository(Product).findOneBy({ id });
    if (!current) {
      throw new NotFoundException('Producto no encontrado');
    }
    const updated = await this.ds.transaction(async (m) => {
      await m.update(Product, { id }, dto);
      const row = await m.findOneByOrFail(Product, { id });
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'product.updated',
        entity: 'product',
        entityId: id,
        meta: dto as Record<string, unknown>,
      });
      return row;
    });
    return ProductAdminResponseDto.from(updated);
  }
}
