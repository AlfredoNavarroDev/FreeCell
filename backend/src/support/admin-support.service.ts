import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { TicketStatus } from '../database/enums';
import {
  AdminTicketDetailDto,
  AdminTicketSummaryDto,
  TicketCloseResultDto,
} from './dto/admin-ticket-response.dto';
import { ListAdminTicketsQueryDto } from './dto/list-admin-tickets-query.dto';
import { MessageBodyDto } from './dto/ticket-message.dto';
import { appendMessage, loadTicketMessages } from './support-queries';

@Injectable()
export class AdminSupportService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** RF-ADM-44: cola, más antiguo primero. */
  async list(
    dto: ListAdminTicketsQueryDto,
  ): Promise<PaginatedResponseDto<AdminTicketSummaryDto>> {
    const offset = (dto.page - 1) * dto.pageSize;
    const items: AdminTicketSummaryDto[] = await this.ds.query(
      `SELECT t.id AS "ticketId", t.subject, t.status, t."createdAt",
              u.name AS "customerName", u.email AS "customerEmail",
              (SELECT count(*) FROM ticket_messages tm WHERE tm."ticketId" = t.id)::int AS "messageCount",
              (SELECT max(tm."createdAt") FROM ticket_messages tm WHERE tm."ticketId" = t.id) AS "lastMessageAt"
         FROM support_tickets t
         JOIN users u ON u.id = t."userId"
        WHERE ($1::text IS NULL OR t.status::text = $1)
        ORDER BY t."createdAt" ASC, t.id ASC
        LIMIT $2 OFFSET $3`,
      [dto.status ?? null, dto.pageSize, offset],
    );
    const [{ count }]: { count: string }[] = await this.ds.query(
      `SELECT count(*) FROM support_tickets WHERE ($1::text IS NULL OR status::text = $1)`,
      [dto.status ?? null],
    );
    return PaginatedResponseDto.from(
      items,
      Number(count),
      dto.page,
      dto.pageSize,
    );
  }

  async detail(ticketId: string): Promise<AdminTicketDetailDto> {
    const rows: Omit<AdminTicketDetailDto, 'messages'>[] = await this.ds.query(
      `SELECT t.id AS "ticketId", t.subject, t.status, t."createdAt",
              u.name AS "customerName", u.email AS "customerEmail"
         FROM support_tickets t JOIN users u ON u.id = t."userId"
        WHERE t.id = $1`,
      [ticketId],
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
    admin: AuthenticatedUser,
    ticketId: string,
    dto: MessageBodyDto,
  ): Promise<AdminTicketDetailDto> {
    await appendMessage(this.ds, {
      ticketId,
      authorId: admin.id,
      body: dto.body,
      isAdmin: true,
    });
    return this.detail(ticketId);
  }

  async close(
    admin: AuthenticatedUser,
    ticketId: string,
  ): Promise<TicketCloseResultDto> {
    await this.ds.transaction(async (m) => {
      const rows: { status: TicketStatus }[] = await m.query(
        `SELECT status FROM support_tickets WHERE id = $1 FOR UPDATE`,
        [ticketId],
      );
      if (!rows[0]) {
        throw new NotFoundException('Ticket no encontrado');
      }
      if (rows[0].status === TicketStatus.CLOSED) {
        throw new ConflictException('El ticket ya está cerrado');
      }
      await m.query(
        `UPDATE support_tickets SET status = 'CLOSED', "updatedAt" = now() WHERE id = $1`,
        [ticketId],
      );
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'ticket.closed',
        entity: 'support_ticket',
        entityId: ticketId,
      });
    });
    return { ticketId, status: TicketStatus.CLOSED };
  }
}
