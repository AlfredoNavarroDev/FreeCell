import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Category } from '../database/entities';
import { CategoryAdminResponseDto } from './dto/category-admin-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesAdminService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<CategoryAdminResponseDto[]> {
    const rows = await this.ds
      .getRepository(Category)
      .find({ order: { name: 'ASC' } });
    return rows.map((row) => CategoryAdminResponseDto.from(row));
  }

  async create(
    admin: AuthenticatedUser,
    dto: CreateCategoryDto,
  ): Promise<CategoryAdminResponseDto> {
    const created = await this.ds.transaction(async (m) => {
      const row = await m.save(Category, m.create(Category, dto));
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'category.created',
        entity: 'category',
        entityId: row.id,
        meta: { name: row.name },
      });
      return row;
    });
    return CategoryAdminResponseDto.from(created);
  }

  async update(
    admin: AuthenticatedUser,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryAdminResponseDto> {
    const current = await this.ds.getRepository(Category).findOneBy({ id });
    if (!current) {
      throw new NotFoundException('Categoría no encontrada');
    }
    const updated = await this.ds.transaction(async (m) => {
      await m.update(Category, { id }, dto);
      const row = await m.findOneByOrFail(Category, { id });
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'category.updated',
        entity: 'category',
        entityId: id,
        meta: dto as Record<string, unknown>,
      });
      return row;
    });
    return CategoryAdminResponseDto.from(updated);
  }

  async remove(admin: AuthenticatedUser, id: string): Promise<void> {
    const current = await this.ds.getRepository(Category).findOneBy({ id });
    if (!current) {
      throw new NotFoundException('Categoría no encontrada');
    }
    await this.ds.transaction(async (m) => {
      await m.delete(Category, { id });
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'category.deleted',
        entity: 'category',
        entityId: id,
        meta: { name: current.name },
      });
    });
  }
}
