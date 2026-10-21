import { ApiProperty } from '@nestjs/swagger';
import { Category } from '../../database/entities';

export class CategoryAdminResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;

  static from(entity: Category): CategoryAdminResponseDto {
    return { id: entity.id, name: entity.name };
  }
}
