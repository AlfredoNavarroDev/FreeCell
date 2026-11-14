import { ApiProperty } from '@nestjs/swagger';
import { TicketStatus } from '../../database/enums';
import { TicketMessageDto } from './ticket-response.dto';

export class AdminTicketSummaryDto {
  @ApiProperty() ticketId!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: TicketStatus }) status!: TicketStatus;
  @ApiProperty({ type: String, nullable: true }) customerName!: string | null;
  @ApiProperty() customerEmail!: string;
  @ApiProperty() messageCount!: number;
  @ApiProperty() lastMessageAt!: Date;
  @ApiProperty() createdAt!: Date;
}

export class AdminTicketDetailDto {
  @ApiProperty() ticketId!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: TicketStatus }) status!: TicketStatus;
  @ApiProperty({ type: String, nullable: true }) customerName!: string | null;
  @ApiProperty() customerEmail!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: [TicketMessageDto] }) messages!: TicketMessageDto[];
}

export class TicketCloseResultDto {
  @ApiProperty() ticketId!: string;
  @ApiProperty({ enum: TicketStatus }) status!: TicketStatus;
}
