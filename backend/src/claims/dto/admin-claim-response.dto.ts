import { ApiProperty } from '@nestjs/swagger';
import { ClaimStatus } from '../../database/enums';

export class AdminClaimResponseDto {
  @ApiProperty() claimId!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() orderNumber!: number;
  @ApiProperty({ enum: ClaimStatus }) status!: ClaimStatus;
  @ApiProperty() reason!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() availableStock!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: String, nullable: true }) customerName!: string | null;
  @ApiProperty() customerEmail!: string;
}

export class ClaimActionResultDto {
  @ApiProperty() claimId!: string;
  @ApiProperty({ enum: ClaimStatus }) status!: ClaimStatus;
  @ApiProperty() orderNumber!: number;
}
