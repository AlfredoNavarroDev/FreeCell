import { ApiProperty } from '@nestjs/swagger';
import { Product } from '../../database/entities';

export class ProductAdminResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) categoryId!: string | null;
  @ApiProperty() requiresToolUsername!: boolean;
  @ApiProperty() active!: boolean;

  static from(entity: Product): ProductAdminResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      description: entity.description,
      categoryId: entity.categoryId,
      requiresToolUsername: entity.requiresToolUsername,
      active: entity.active,
    };
  }
}
