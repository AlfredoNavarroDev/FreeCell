import { ApiProperty } from '@nestjs/swagger';
import { TicketStatus } from '../../database/enums';

export class TicketMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() body!: string;
  @ApiProperty() isAdmin!: boolean;
  @ApiProperty() createdAt!: Date;
}

export class TicketSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: TicketStatus }) status!: TicketStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class TicketDetailDto extends TicketSummaryDto {
  @ApiProperty({ type: [TicketMessageDto] }) messages!: TicketMessageDto[];
}
