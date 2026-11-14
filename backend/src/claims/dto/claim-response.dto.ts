import { ApiProperty } from '@nestjs/swagger';
import { ClaimStatus } from '../../database/enums';

export class ClaimResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() orderNumber!: number;
  @ApiProperty({ enum: ClaimStatus }) status!: ClaimStatus;
  @ApiProperty() reason!: string;
  @ApiProperty({ type: String, nullable: true }) rejectionReason!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) resolvedAt!: Date | null;
}
