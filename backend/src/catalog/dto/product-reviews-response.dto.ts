import { ApiProperty } from '@nestjs/swagger';

export class PublicReviewDto {
  @ApiProperty() id!: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiProperty() body!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty() createdAt!: Date;
}

export class ProductReviewsPageDto {
  @ApiProperty({ type: [PublicReviewDto] }) items!: PublicReviewDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({ type: Number, nullable: true }) ratingAvg!: number | null;
  @ApiProperty() ratingCount!: number;
}
