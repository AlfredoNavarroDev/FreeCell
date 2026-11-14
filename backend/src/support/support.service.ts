import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import { MessageBodyDto } from './dto/ticket-message.dto';
import { TicketDetailDto, TicketSummaryDto } from './dto/ticket-response.dto';
import { appendMessage, loadTicketMessages } from './support-queries';

@Injectable()
export class SupportService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** RF-SUP-01: ticket OPEN + primer mensaje en una sola transacción. */
  async create(
    user: AuthenticatedUser,
    dto: CreateTicketDto,
  ): Promise<TicketDetailDto> {
    const ticketId = await this.ds.transaction(async (m) => {
      const [{ id }]: { id: string }[] = await m.query(
        `INSERT INTO support_tickets ("userId", subject, status)
         VALUES ($1, $2, 'OPEN') RETURNING id`,
        [user.id, dto.subject],
      );
      await m.query(
        `INSERT INTO ticket_messages ("ticketId", "authorId", body, "isAdmin")
         VALUES ($1, $2, $3, false)`,
        [id, user.id, dto.body],
      );
      await this.audit.log(m, {
        actorId: user.id,
        action: 'ticket.created',
        entity: 'support_ticket',
        entityId: id,
      });
      return id;
    });
    return this.getForUser(user.id, ticketId);
  }

  async listForUser(
    userId: string,
    dto: ListTicketsQueryDto,
  ): Promise<PaginatedResponseDto<TicketSummaryDto>> {
    const offset = (dto.page - 1) * dto.pageSize;
    const items: TicketSummaryDto[] = await this.ds.query(
      `SELECT id, subject, status, "createdAt", "updatedAt"
         FROM support_tickets
        WHERE "userId" = $1
        ORDER BY "updatedAt" DESC, id ASC
        LIMIT $2 OFFSET $3`,
      [userId, dto.pageSize, offset],
    );
    const [{ count }]: { count: string }[] = await this.ds.query(
      `SELECT count(*) FROM support_tickets WHERE "userId" = $1`,
      [userId],
    );
    return PaginatedResponseDto.from(
      items,
      Number(count),
      dto.page,
      dto.pageSize,
    );
  }

  /** RF-SUP-02: solo tickets propios; ajeno = 404 para no filtrar existencia. */
  async getForUser(userId: string, ticketId: string): Promise<TicketDetailDto> {
    const rows: TicketSummaryDto[] = await this.ds.query(
      `SELECT id, subject, status, "createdAt", "updatedAt"
         FROM support_tickets WHERE id = $1 AND "userId" = $2`,
      [ticketId, userId],
    );
    if (!rows[0]) {
      throw new NotFoundException('Ticket no encontrado');
    }
    return {
      ...rows[0],
      messages: await loadTicketMessages(this.ds, ticketId),
    };
  }

  async reply(
    user: AuthenticatedUser,
    ticketId: string,
    dto: MessageBodyDto,
  ): Promise<TicketDetailDto> {
    await appendMessage(this.ds, {
      ticketId,
      authorId: user.id,
      body: dto.body,
      isAdmin: false,
      ownerId: user.id,
    });
    return this.getForUser(user.id, ticketId);
  }
}
