import { ApiProperty } from '@nestjs/swagger';
import { ReviewStatus } from '../../database/enums';

export class AdminReviewResponseDto {
  @ApiProperty() reviewId!: string;
  @ApiProperty({ enum: ReviewStatus }) status!: ReviewStatus;
  @ApiProperty() rating!: number;
  @ApiProperty() body!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() orderNumber!: number;
  @ApiProperty({ type: String, nullable: true }) customerName!: string | null;
  @ApiProperty() customerEmail!: string;
  @ApiProperty() createdAt!: Date;
}

export class ReviewActionResultDto {
  @ApiProperty() reviewId!: string;
  @ApiProperty({ enum: ReviewStatus }) status!: ReviewStatus;
}
