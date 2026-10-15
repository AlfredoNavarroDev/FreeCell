import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CategoryResponseDto } from './dto/category-response.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly ds: DataSource) {}

  async listCategories(): Promise<CategoryResponseDto[]> {
    return this.ds.query(`SELECT id, name FROM categories ORDER BY name`);
  }
}
