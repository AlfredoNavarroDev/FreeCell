import { ApiProperty } from '@nestjs/swagger';
import { ReviewStatus } from '../../database/enums';

export class ReviewResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() rating!: number;
  @ApiProperty() body!: string;
  @ApiProperty({ enum: ReviewStatus }) status!: ReviewStatus;
  @ApiProperty() createdAt!: Date;
}
