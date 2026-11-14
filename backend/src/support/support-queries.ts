import { ConflictException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { TicketStatus } from '../database/enums';
import type { TicketMessageDto } from './dto/ticket-response.dto';

export async function loadTicketMessages(
  q: Pick<DataSource, 'query'>,
  ticketId: string,
): Promise<TicketMessageDto[]> {
  return q.query(
    `SELECT id, body, "isAdmin", "createdAt"
       FROM ticket_messages
      WHERE "ticketId" = $1
      ORDER BY "createdAt" ASC, id ASC`,
    [ticketId],
  );
}

export interface AppendMessageParams {
  ticketId: string;
  authorId: string;
  body: string;
  isAdmin: boolean;
  /** Si se pasa, el ticket debe pertenecer a ese usuario (404 si no). */
  ownerId?: string;
}

/** Bloquea el ticket (FOR UPDATE) para serializar mensaje vs. cierre; 409 si está CLOSED. */
export async function appendMessage(
  ds: DataSource,
  p: AppendMessageParams,
): Promise<void> {
  await ds.transaction(async (m) => {
    const rows: { status: TicketStatus }[] = await m.query(
      `SELECT status FROM support_tickets
        WHERE id = $1 AND ($2::uuid IS NULL OR "userId" = $2)
        FOR UPDATE`,
      [p.ticketId, p.ownerId ?? null],
    );
    const ticket = rows[0];
    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }
    if (ticket.status === TicketStatus.CLOSED) {
      throw new ConflictException('El ticket está cerrado');
    }
    await m.query(
      `INSERT INTO ticket_messages ("ticketId", "authorId", body, "isAdmin")
       VALUES ($1, $2, $3, $4)`,
      [p.ticketId, p.authorId, p.body, p.isAdmin],
    );
    await m.query(
      `UPDATE support_tickets SET "updatedAt" = now() WHERE id = $1`,
      [p.ticketId],
    );
  });
}
