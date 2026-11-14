# Soporte por tickets (S9/S11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tickets de soporte: el cliente abre/responde tickets (S9) y el admin los atiende y cierra (S11, solo tickets).

**Architecture:** Módulo NestJS `src/support/` con SQL crudo vía `DataSource` (mismo estilo que `src/claims/`), sin migración (las tablas existen). Frontend: server actions `lib/support-client.ts` / `lib/support-admin-client.ts`, páginas `/tickets`, `/tickets/[id]`, `/admin/soporte`, con la estructura maestro-detalle de `/admin/reclamos`.

**Tech Stack:** NestJS 11 + TypeORM (raw queries), class-validator, Jest/supertest e2e; Next.js 16 (App Router, `params` es `Promise`) + Tailwind v4 + Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-soporte-tickets-s9-s11-design.md`

## Global Constraints

- Idioma: mensajes al usuario, errores y docs en español (es-PE); código, rutas y entidades en inglés.
- Commits nuevos (sin `--amend`), sin `--no-verify`, **sin línea `Co-Authored-By`**; autor único Alfredo. No `push`.
- Trabajar en worktree/rama `worktree-soporte-s9` (skill `superpowers:using-git-worktrees`); la rama no se borra al terminar.
- Tipos solo-tipo con `import type`, excepto parámetros de constructor con DI (import normal).
- No subir `@nestjs/config`, `jwt`, `passport`, `bullmq`, `typeorm` a v12.
- Next.js 16: antes de escribir páginas/proxy, leer lo relevante en `frontend/node_modules/next/dist/docs/`.
- Tests e2e backend: `cd backend && TEST_DATABASE_URL=<puerto 5433 según .env de test> npm run test:e2e -- --runInBand <archivo>` (ver `docs/backend/README.md`); Docker (`docker compose up -d`) debe estar arriba.
- Accesibilidad AA: elementos nativos, objetivos ≥ 44 px, estado nunca solo por color.
- No inventar datos de negocio; placeholders `[..]` donde corresponda.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `backend/src/support/support-queries.ts` | Helpers SQL compartidos: `loadTicketMessages`, `appendMessage` |
| `backend/src/support/dto/*.ts` | DTOs de entrada y respuesta |
| `backend/src/support/support.service.ts` + `support.controller.ts` | Lado cliente `/support-tickets` |
| `backend/src/support/admin-support.service.ts` + `admin-support.controller.ts` | Lado admin `/admin/support-tickets` |
| `backend/src/support/support.module.ts` | Módulo; se importa en `app.module.ts` |
| `backend/test/support.e2e-spec.ts`, `backend/test/admin-support.e2e-spec.ts` | E2E |
| `frontend/src/lib/support-client.ts`, `support-admin-client.ts` (+ `.test.ts`) | Server actions |
| `frontend/src/components/ticket-messages.tsx` | Hilo de mensajes (compartido cliente/admin) |
| `frontend/src/components/tickets-screen.tsx`, `ticket-thread.tsx` | S9 |
| `frontend/src/components/admin-support-queue.tsx`, `admin-ticket-detail.tsx` | S11 |
| `frontend/src/app/tickets/page.tsx`, `tickets/[id]/page.tsx`, `admin/soporte/page.tsx` | Rutas |

---

### Task 1: Backend — DTOs, helpers y lado cliente

**Files:**
- Create: `backend/src/support/dto/create-ticket.dto.ts`, `ticket-message.dto.ts`, `list-tickets-query.dto.ts`, `ticket-response.dto.ts`
- Create: `backend/src/support/support-queries.ts`, `support.service.ts`, `support.controller.ts`, `support.module.ts`
- Modify: `backend/src/app.module.ts` (importar `SupportModule`, junto a `ClaimsModule` en línea 12 y en `imports`)
- Test: `backend/test/support.e2e-spec.ts`

**Interfaces:**
- Produces (usados por Task 2): `appendMessage(ds: DataSource, p: { ticketId: string; authorId: string; body: string; isAdmin: boolean; ownerId?: string }): Promise<void>` (404 `NotFoundException('Ticket no encontrado')`, 409 `ConflictException('El ticket está cerrado')`); `loadTicketMessages(q: Pick<DataSource,'query'>, ticketId: string): Promise<TicketMessageDto[]>`; `TicketMessageDto`, `TicketDetailDto`, `TicketSummaryDto`; `MessageBodyDto { body }`.

- [ ] **Step 1: Escribir el e2e que falla** — `backend/test/support.e2e-spec.ts`

```ts
import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { type User } from '../src/database/entities';
import { createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('/support-tickets (cliente)', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const tokenFor = (user: User) =>
    app.get(JwtService).sign({ sub: user.id, role: user.role });
  const auth = (user: User) => ({ Authorization: `Bearer ${tokenFor(user)}` });

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });
  beforeEach(async () => {
    await resetState(app);
  });
  afterAll(async () => {
    await app.close();
  });

  async function openTicket(user: User, subject = 'No me llega la clave') {
    const res = await request(app.getHttpServer())
      .post('/support-tickets')
      .set(auth(user))
      .send({ subject, body: 'Pagué hace una hora y no veo nada' });
    return res;
  }

  it('crea un ticket OPEN con su primer mensaje y lo audita', async () => {
    const user = await createUser(ds);
    const res = await openTicket(user);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0]).toMatchObject({
      body: 'Pagué hace una hora y no veo nada',
      isAdmin: false,
    });
    const audits = await ds.query(
      `SELECT 1 FROM audit_logs WHERE action = 'ticket.created' AND "entityId" = $1`,
      [res.body.id],
    );
    expect(audits).toHaveLength(1);
  });

  it('rechaza asunto corto o mensaje vacío con 400', async () => {
    const user = await createUser(ds);
    const short = await request(app.getHttpServer())
      .post('/support-tickets')
      .set(auth(user))
      .send({ subject: 'ab', body: 'hola' });
    const empty = await request(app.getHttpServer())
      .post('/support-tickets')
      .set(auth(user))
      .send({ subject: 'Asunto válido', body: '   ' });
    expect(short.status).toBe(400);
    expect(empty.status).toBe(400);
  });

  it('exige sesión', async () => {
    const res = await request(app.getHttpServer()).get('/support-tickets');
    expect(res.status).toBe(401);
  });

  it('lista solo los tickets propios, paginados', async () => {
    const a = await createUser(ds);
    const b = await createUser(ds);
    await openTicket(a, 'Ticket de A uno');
    await openTicket(a, 'Ticket de A dos');
    await openTicket(b, 'Ticket de B');

    const res = await request(app.getHttpServer())
      .get('/support-tickets?pageSize=1')
      .set(auth(a));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].messages).toBeUndefined();
  });

  it('el detalle de un ticket ajeno es 404', async () => {
    const a = await createUser(ds);
    const b = await createUser(ds);
    const created = await openTicket(a);
    const res = await request(app.getHttpServer())
      .get(`/support-tickets/${created.body.id}`)
      .set(auth(b));
    expect(res.status).toBe(404);
  });

  it('responde en un ticket abierto y devuelve el hilo', async () => {
    const user = await createUser(ds);
    const created = await openTicket(user);
    const res = await request(app.getHttpServer())
      .post(`/support-tickets/${created.body.id}/messages`)
      .set(auth(user))
      .send({ body: 'Sigo esperando' });
    expect(res.status).toBe(201);
    expect(res.body.messages.map((m: { body: string }) => m.body)).toEqual([
      'Pagué hace una hora y no veo nada',
      'Sigo esperando',
    ]);
  });

  it('un ticket CLOSED rechaza mensajes del cliente con 409 (RF-SUP-04)', async () => {
    const user = await createUser(ds);
    const created = await openTicket(user);
    await ds.query(`UPDATE support_tickets SET status = 'CLOSED' WHERE id = $1`, [
      created.body.id,
    ]);
    const res = await request(app.getHttpServer())
      .post(`/support-tickets/${created.body.id}/messages`)
      .set(auth(user))
      .send({ body: 'Hola?' });
    expect(res.status).toBe(409);
  });

  it('responder en ticket ajeno es 404', async () => {
    const a = await createUser(ds);
    const b = await createUser(ds);
    const created = await openTicket(a);
    const res = await request(app.getHttpServer())
      .post(`/support-tickets/${created.body.id}/messages`)
      .set(auth(b))
      .send({ body: 'intruso' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd backend && npm run test:e2e -- --runInBand support.e2e-spec` (con `TEST_DATABASE_URL` del puerto 5433)
Expected: FAIL (404 en `/support-tickets`: la ruta no existe).

- [ ] **Step 3: DTOs**

`backend/src/support/dto/create-ticket.dto.ts`
```ts
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTicketDto {
  @ApiProperty({ minLength: 3, maxLength: 150 })
  @Transform(trim)
  @IsString({ message: 'subject debe ser texto' })
  @Length(3, 150, { message: 'subject debe tener entre 3 y 150 caracteres' })
  subject!: string;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(trim)
  @IsString({ message: 'body debe ser texto' })
  @Length(1, 2000, { message: 'body debe tener entre 1 y 2000 caracteres' })
  body!: string;
}
```

`backend/src/support/dto/ticket-message.dto.ts` (entrada de mensaje)
```ts
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class MessageBodyDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'body debe ser texto' })
  @Length(1, 2000, { message: 'body debe tener entre 1 y 2000 caracteres' })
  body!: string;
}
```

`backend/src/support/dto/list-tickets-query.dto.ts`
```ts
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListTicketsQueryDto extends PaginationQueryDto {}
```

`backend/src/support/dto/ticket-response.dto.ts`
```ts
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
```

- [ ] **Step 4: Helpers SQL** — `backend/src/support/support-queries.ts`

```ts
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
    await m.query(`UPDATE support_tickets SET "updatedAt" = now() WHERE id = $1`, [
      p.ticketId,
    ]);
  });
}
```

- [ ] **Step 5: Service** — `backend/src/support/support.service.ts`

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import { MessageBodyDto } from './dto/ticket-message.dto';
import {
  TicketDetailDto,
  TicketSummaryDto,
} from './dto/ticket-response.dto';
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
    return PaginatedResponseDto.from(items, Number(count), dto.page, dto.pageSize);
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
    return { ...rows[0], messages: await loadTicketMessages(this.ds, ticketId) };
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
```

- [ ] **Step 6: Controller y módulo**

`backend/src/support/support.controller.ts`
```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import { MessageBodyDto } from './dto/ticket-message.dto';
import {
  TicketDetailDto,
  TicketSummaryDto,
} from './dto/ticket-response.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@ApiBearerAuth()
@Controller('support-tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
  ): Promise<TicketDetailDto> {
    return this.support.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: ListTicketsQueryDto,
  ): Promise<PaginatedResponseDto<TicketSummaryDto>> {
    return this.support.listForUser(user.id, dto);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TicketDetailDto> {
    return this.support.getForUser(user.id, id);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MessageBodyDto,
  ): Promise<TicketDetailDto> {
    return this.support.reply(user, id, dto);
  }
}
```

`backend/src/support/support.module.ts` (Task 2 agrega el admin)
```ts
import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
```

En `backend/src/app.module.ts`: `import { SupportModule } from './support/support.module';` y añadir `SupportModule` al array `imports` junto a `ClaimsModule`.

- [ ] **Step 7: Correr y ver que pasa**

Run: `cd backend && npm run typecheck && npm run test:e2e -- --runInBand support.e2e-spec`
Expected: PASS (8 tests). Si la fila `audit_logs` usa otros nombres de columna, ajustar la consulta del primer test al esquema real (`docs/backend/database.md`).

- [ ] **Step 8: Commit**

```bash
git add backend/src/support backend/src/app.module.ts backend/test/support.e2e-spec.ts
git commit -m "Backend: modulo de soporte, tickets del cliente POST/GET /support-tickets (S9)"
```

---

### Task 2: Backend — lado admin

**Files:**
- Create: `backend/src/support/dto/admin-ticket-response.dto.ts`, `list-admin-tickets-query.dto.ts`, `admin-support.service.ts`, `admin-support.controller.ts`
- Modify: `backend/src/support/support.module.ts`
- Test: `backend/test/admin-support.e2e-spec.ts`

**Interfaces:**
- Consumes: `appendMessage`, `loadTicketMessages`, `MessageBodyDto`, `TicketMessageDto` (Task 1).
- Produces (JSON usado por el frontend): cola `{ticketId, subject, status, customerName, customerEmail, messageCount, lastMessageAt, createdAt}`; detalle `{ticketId, subject, status, customerName, customerEmail, createdAt, messages[]}`; cierre `{ticketId, status}`.

- [ ] **Step 1: Escribir el e2e que falla** — `backend/test/admin-support.e2e-spec.ts`

```ts
import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { type User } from '../src/database/entities';
import { Role } from '../src/database/enums';
import { createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('/admin/support-tickets', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const auth = (user: User) => ({
    Authorization: `Bearer ${app.get(JwtService).sign({ sub: user.id, role: user.role })}`,
  });

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });
  beforeEach(async () => {
    await resetState(app);
  });
  afterAll(async () => {
    await app.close();
  });

  async function openTicket(user: User, subject = 'Ayuda con mi pedido') {
    const res = await request(app.getHttpServer())
      .post('/support-tickets')
      .set(auth(user))
      .send({ subject, body: 'Necesito ayuda' });
    return res.body.id as string;
  }

  it('un cliente no accede a la cola (403)', async () => {
    const user = await createUser(ds);
    const res = await request(app.getHttpServer())
      .get('/admin/support-tickets')
      .set(auth(user));
    expect(res.status).toBe(403);
  });

  it('lista la cola con filtro por estado, más antiguo primero', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const first = await openTicket(user, 'Primero');
    const second = await openTicket(user, 'Segundo');
    await ds.query(`UPDATE support_tickets SET status = 'CLOSED' WHERE id = $1`, [second]);

    const open = await request(app.getHttpServer())
      .get('/admin/support-tickets?status=OPEN')
      .set(auth(admin));
    expect(open.status).toBe(200);
    expect(open.body.total).toBe(1);
    expect(open.body.items[0]).toMatchObject({
      ticketId: first,
      subject: 'Primero',
      status: 'OPEN',
      customerEmail: user.email,
      messageCount: 1,
    });

    const all = await request(app.getHttpServer())
      .get('/admin/support-tickets')
      .set(auth(admin));
    expect(all.body.items.map((t: { subject: string }) => t.subject)).toEqual([
      'Primero',
      'Segundo',
    ]);
  });

  it('detalle devuelve hilo y datos del cliente; id inexistente es 404', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const id = await openTicket(user);
    const ok = await request(app.getHttpServer())
      .get(`/admin/support-tickets/${id}`)
      .set(auth(admin));
    expect(ok.status).toBe(200);
    expect(ok.body.customerEmail).toBe(user.email);
    expect(ok.body.messages).toHaveLength(1);

    const missing = await request(app.getHttpServer())
      .get('/admin/support-tickets/00000000-0000-4000-8000-000000000000')
      .set(auth(admin));
    expect(missing.status).toBe(404);
  });

  it('el admin responde (isAdmin=true) y el cliente ve la respuesta', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const id = await openTicket(user);
    const res = await request(app.getHttpServer())
      .post(`/admin/support-tickets/${id}/messages`)
      .set(auth(admin))
      .send({ body: 'Ya lo revisamos' });
    expect(res.status).toBe(201);
    expect(res.body.messages[1]).toMatchObject({ body: 'Ya lo revisamos', isAdmin: true });

    const mine = await request(app.getHttpServer())
      .get(`/support-tickets/${id}`)
      .set(auth(user));
    expect(mine.body.messages).toHaveLength(2);
  });

  it('cerrar: pasa a CLOSED, audita y bloquea más mensajes y cierres', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const id = await openTicket(user);

    const close = await request(app.getHttpServer())
      .post(`/admin/support-tickets/${id}/close`)
      .set(auth(admin));
    expect(close.status).toBe(200);
    expect(close.body).toEqual({ ticketId: id, status: 'CLOSED' });
    const audits = await ds.query(
      `SELECT 1 FROM audit_logs WHERE action = 'ticket.closed' AND "entityId" = $1`,
      [id],
    );
    expect(audits).toHaveLength(1);

    const again = await request(app.getHttpServer())
      .post(`/admin/support-tickets/${id}/close`)
      .set(auth(admin));
    expect(again.status).toBe(409);
    const reply = await request(app.getHttpServer())
      .post(`/admin/support-tickets/${id}/messages`)
      .set(auth(admin))
      .send({ body: 'tarde' });
    expect(reply.status).toBe(409);
  });

  it('cierre y mensaje concurrentes nunca dejan un mensaje tras el cierre', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const id = await openTicket(user);

    const [close, message] = await Promise.all([
      request(app.getHttpServer())
        .post(`/admin/support-tickets/${id}/close`)
        .set(auth(admin)),
      request(app.getHttpServer())
        .post(`/support-tickets/${id}/messages`)
        .set(auth(user))
        .send({ body: 'mensaje en carrera' }),
    ]);

    expect(close.status).toBe(200);
    expect([201, 409]).toContain(message.status);
    const [{ count }]: { count: string }[] = await ds.query(
      `SELECT count(*) FROM ticket_messages WHERE "ticketId" = $1`,
      [id],
    );
    expect(Number(count)).toBe(message.status === 201 ? 2 : 1);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd backend && npm run test:e2e -- --runInBand admin-support.e2e-spec`
Expected: FAIL (404 en rutas `/admin/support-tickets`).

- [ ] **Step 3: DTOs admin**

`backend/src/support/dto/list-admin-tickets-query.dto.ts`
```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TicketStatus } from '../../database/enums';

export class ListAdminTicketsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsIn(Object.values(TicketStatus), {
    message: 'status no es un estado válido',
  })
  status?: TicketStatus;
}
```

`backend/src/support/dto/admin-ticket-response.dto.ts`
```ts
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
```

- [ ] **Step 4: Service admin** — `backend/src/support/admin-support.service.ts`

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    return PaginatedResponseDto.from(items, Number(count), dto.page, dto.pageSize);
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
    return { ...rows[0], messages: await loadTicketMessages(this.ds, ticketId) };
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
```

- [ ] **Step 5: Controller admin y módulo**

`backend/src/support/admin-support.controller.ts`
```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { AdminSupportService } from './admin-support.service';
import {
  AdminTicketDetailDto,
  AdminTicketSummaryDto,
  TicketCloseResultDto,
} from './dto/admin-ticket-response.dto';
import { ListAdminTicketsQueryDto } from './dto/list-admin-tickets-query.dto';
import { MessageBodyDto } from './dto/ticket-message.dto';

@ApiTags('admin-support')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/support-tickets')
export class AdminSupportController {
  constructor(private readonly support: AdminSupportService) {}

  @Get()
  list(
    @Query() dto: ListAdminTicketsQueryDto,
  ): Promise<PaginatedResponseDto<AdminTicketSummaryDto>> {
    return this.support.list(dto);
  }

  @Get(':id')
  detail(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdminTicketDetailDto> {
    return this.support.detail(id);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MessageBodyDto,
  ): Promise<AdminTicketDetailDto> {
    return this.support.reply(admin, id, dto);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TicketCloseResultDto> {
    return this.support.close(admin, id);
  }
}
```

Reemplazar `support.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AdminSupportController } from './admin-support.controller';
import { AdminSupportService } from './admin-support.service';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, AdminSupportService],
})
export class SupportModule {}
```

- [ ] **Step 6: Correr toda la suite backend**

Run: `cd backend && npm run typecheck && npm run lint && npm run test:e2e -- --runInBand`
Expected: PASS (suite previa de 202 + los nuevos). Lint: errores previos de imports sin usar en archivos no tocados (`OrderStatus`, `UpdateUsdRateDto`) no son de esta tarea.

- [ ] **Step 7: Commit**

```bash
git add backend/src/support backend/test/admin-support.e2e-spec.ts
git commit -m "Backend: modulo admin de soporte GET/POST /admin/support-tickets y cierre (S11)"
```

---

### Task 3: Frontend — clientes server action + proxy + header

**Files:**
- Create: `frontend/src/lib/support-client.ts`, `frontend/src/lib/support-admin-client.ts`
- Test: `frontend/src/lib/support-client.test.ts`, `frontend/src/lib/support-admin-client.test.ts`
- Modify: `frontend/src/proxy.ts` (proteger `/tickets`)

**Interfaces:**
- Produces: tipos `TicketStatus = "OPEN" | "CLOSED"`, `TicketMessageView {id; body; isAdmin; createdAt}`, `TicketSummaryView {id; subject; status; createdAt; updatedAt}`, `TicketDetailView extends TicketSummaryView {messages: TicketMessageView[]}`; `SupportActionResult<T>`; funciones `createTicket(subject, body)`, `listTickets()`, `getTicket(id)`, `replyTicket(id, body)`. Admin: `AdminTicketSummary {ticketId; subject; status; customerName; customerEmail; messageCount; lastMessageAt; createdAt}`, `AdminTicketDetail {ticketId; subject; status; customerName; customerEmail; createdAt; messages}`, `fetchAdminTickets(status?, pageSize?)`, `getAdminTicket(id)`, `replyAdminTicket(id, body)`, `closeAdminTicket(id)`.

- [ ] **Step 1: Tests que fallan** — `frontend/src/lib/support-client.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: authMock }));

describe("support-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("createTicket hace POST /support-tickets con subject y body", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const ticket = { id: "t1", subject: "Ayuda", status: "OPEN", messages: [] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(ticket), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const { createTicket } = await import("./support-client");
    const result = await createTicket("Ayuda", "Necesito ayuda");

    expect(result).toEqual({ ok: true, data: ticket });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/support-tickets");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ subject: "Ayuda", body: "Necesito ayuda" });
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-123" });
  });

  it("replyTicket devuelve el mensaje del backend ante 409 (ticket cerrado)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ statusCode: 409, message: "El ticket está cerrado" }), { status: 409 }),
      ),
    );

    const { replyTicket } = await import("./support-client");
    const result = await replyTicket("t1", "hola");

    expect(result).toEqual({ ok: false, status: 409, message: "El ticket está cerrado" });
  });

  it("devuelve 401 sin llamar al backend si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { listTickets } = await import("./support-client");
    const result = await listTickets();

    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

`frontend/src/lib/support-admin-client.test.ts`
```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: authMock }));

describe("support-admin-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("fetchAdminTickets pide la cola filtrada por estado", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminTickets } = await import("./support-admin-client");
    const result = await fetchAdminTickets("OPEN");

    expect(result).toEqual({ ok: true, data: page });
    expect(fetchMock.mock.calls[0][0]).toContain("/admin/support-tickets?status=OPEN&pageSize=50");
  });

  it("closeAdminTicket hace POST a /close", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ticketId: "t1", status: "CLOSED" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { closeAdminTicket } = await import("./support-admin-client");
    const result = await closeAdminTicket("t1");

    expect(result).toEqual({ ok: true, data: { ticketId: "t1", status: "CLOSED" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/support-tickets/t1/close");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("replyAdminTicket envía el body", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticketId: "t1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const { replyAdminTicket } = await import("./support-admin-client");
    await replyAdminTicket("t1", "Ya lo vemos");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/support-tickets/t1/messages");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ body: "Ya lo vemos" });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd frontend && npx vitest run src/lib/support-client.test.ts src/lib/support-admin-client.test.ts`
Expected: FAIL (módulos no existen).

- [ ] **Step 3: Implementar** — `frontend/src/lib/support-client.ts`

```ts
"use server";

import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type TicketStatus = "OPEN" | "CLOSED";

export interface TicketMessageView {
  id: string;
  body: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface TicketSummaryView {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetailView extends TicketSummaryView {
  messages: TicketMessageView[];
}

export interface PaginatedTickets {
  items: TicketSummaryView[];
  total: number;
  page: number;
  pageSize: number;
}

export type SupportActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<SupportActionResult<T>> {
  const session = await auth();
  if (!session?.accessToken) {
    return { ok: false, status: 401, message: "Inicia sesión para continuar" };
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message ?? "No pudimos completar la operación";
    return { ok: false, status: res.status, message };
  }

  const data = (await res.json()) as T;
  return { ok: true, data };
}

export async function createTicket(subject: string, body: string): Promise<SupportActionResult<TicketDetailView>> {
  return callBackend<TicketDetailView>("/support-tickets", { method: "POST", body: { subject, body } });
}

export async function listTickets(): Promise<SupportActionResult<PaginatedTickets>> {
  return callBackend<PaginatedTickets>("/support-tickets?pageSize=50", { method: "GET" });
}

export async function getTicket(id: string): Promise<SupportActionResult<TicketDetailView>> {
  return callBackend<TicketDetailView>(`/support-tickets/${id}`, { method: "GET" });
}

export async function replyTicket(id: string, body: string): Promise<SupportActionResult<TicketDetailView>> {
  return callBackend<TicketDetailView>(`/support-tickets/${id}/messages`, { method: "POST", body: { body } });
}
```

`frontend/src/lib/support-admin-client.ts`
```ts
"use server";

import { auth } from "@/auth";
import type { TicketMessageView, TicketStatus } from "@/lib/support-client";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export interface AdminTicketSummary {
  ticketId: string;
  subject: string;
  status: TicketStatus;
  customerName: string | null;
  customerEmail: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

export interface AdminTicketDetail {
  ticketId: string;
  subject: string;
  status: TicketStatus;
  customerName: string | null;
  customerEmail: string;
  createdAt: string;
  messages: TicketMessageView[];
}

export interface AdminTicketsPage {
  items: AdminTicketSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketCloseResult {
  ticketId: string;
  status: TicketStatus;
}

export type AdminSupportActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<AdminSupportActionResult<T>> {
  const session = await auth();
  if (!session?.accessToken) {
    return { ok: false, status: 401, message: "Inicia sesión para continuar" };
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message ?? "No pudimos completar la operación";
    return { ok: false, status: res.status, message };
  }

  const data = (await res.json()) as T;
  return { ok: true, data };
}

export async function fetchAdminTickets(
  status: TicketStatus = "OPEN",
  pageSize = 50,
): Promise<AdminSupportActionResult<AdminTicketsPage>> {
  return callBackend<AdminTicketsPage>(`/admin/support-tickets?status=${status}&pageSize=${pageSize}`, {
    method: "GET",
  });
}

export async function getAdminTicket(id: string): Promise<AdminSupportActionResult<AdminTicketDetail>> {
  return callBackend<AdminTicketDetail>(`/admin/support-tickets/${id}`, { method: "GET" });
}

export async function replyAdminTicket(
  id: string,
  body: string,
): Promise<AdminSupportActionResult<AdminTicketDetail>> {
  return callBackend<AdminTicketDetail>(`/admin/support-tickets/${id}/messages`, {
    method: "POST",
    body: { body },
  });
}

export async function closeAdminTicket(id: string): Promise<AdminSupportActionResult<TicketCloseResult>> {
  return callBackend<TicketCloseResult>(`/admin/support-tickets/${id}/close`, { method: "POST" });
}
```

- [ ] **Step 4: Proteger `/tickets` en el proxy** — en `frontend/src/proxy.ts` cambiar

`const PROTECTED_PREFIXES = ["/cuenta", "/checkout", "/pedidos", ADMIN_PREFIX];` →
`const PROTECTED_PREFIXES = ["/cuenta", "/checkout", "/pedidos", "/tickets", ADMIN_PREFIX];`

y el matcher a
`matcher: ["/admin/:path*", "/cuenta/:path*", "/checkout/:path*", "/pedidos/:path*", "/tickets/:path*"],`

- [ ] **Step 5: Correr tests y typecheck**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS; sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/support-client.ts frontend/src/lib/support-admin-client.ts frontend/src/lib/support-client.test.ts frontend/src/lib/support-admin-client.test.ts frontend/src/proxy.ts
git commit -m "Frontend: clientes support-client y support-admin-client, /tickets protegido (S9/S11)"
```

---

### Task 4: Frontend — pantallas del cliente (S9)

**Files:**
- Create: `frontend/src/components/ticket-messages.tsx`, `tickets-screen.tsx`, `ticket-thread.tsx`
- Create: `frontend/src/app/tickets/page.tsx`, `frontend/src/app/tickets/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 3 (`createTicket`, `getTicket`, `replyTicket`, tipos).
- Produces: `<TicketMessages messages={TicketMessageView[]} />` (lo reutiliza Task 5).

- [ ] **Step 1: Leer docs de Next 16** — `frontend/node_modules/next/dist/docs/` (App Router, dynamic routes: `params` es `Promise`). Confirmar sintaxis de `page.tsx` dinámico y `notFound`.

- [ ] **Step 2: `ticket-messages.tsx`** (sin estado)

```tsx
import type { TicketMessageView } from "@/lib/support-client";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

export function TicketMessages({ messages }: { messages: TicketMessageView[] }) {
  return (
    <ol aria-label="Mensajes del ticket" className="flex flex-col gap-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`max-w-[85%] rounded-xl px-4 py-3 ${
            m.isAdmin ? "self-start bg-accent-soft-bg text-accent-soft-ink" : "self-end bg-bg text-ink"
          }`}
        >
          <p className="mb-1 text-xs font-semibold">{m.isAdmin ? "Soporte Free Cell" : "Tú"}</p>
          <p className="whitespace-pre-wrap">{m.body}</p>
          <p className="mt-1 text-xs text-muted">{formatDate(m.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 3: `tickets-screen.tsx`** (lista + nuevo ticket)

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { createTicket, type TicketSummaryView } from "@/lib/support-client";

const STATUS_LABEL = { OPEN: "Abierto", CLOSED: "Cerrado" } as const;
const STATUS_BADGE = {
  OPEN: "bg-success-bg text-success-ink",
  CLOSED: "bg-bg text-muted",
} as const;

export function TicketsScreen({ initial }: { initial: TicketSummaryView[] }) {
  const [tickets, setTickets] = useState(initial);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = subject.trim().length >= 3 && body.trim().length >= 1 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const result = await createTicket(subject.trim(), body.trim());
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const { messages: _messages, ...summary } = result.data;
    void _messages;
    setTickets([summary, ...tickets]);
    setSubject("");
    setBody("");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section aria-label="Mis tickets">
        <h1 className="mb-5 font-display text-2xl font-bold text-ink">Soporte</h1>
        {tickets.length === 0 ? (
          <div className="rounded-2xl border border-line-soft bg-surface p-10 text-center">
            <p className="font-display text-xl font-bold text-ink">Aún no tienes tickets</p>
            <p className="mt-1 text-muted">Escríbenos desde el formulario y te responderemos aquí.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tickets/${t.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line-soft bg-surface px-4 py-3"
                >
                  <span className="font-semibold text-ink">{t.subject}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-line-soft bg-surface p-5"
        aria-label="Nuevo ticket"
      >
        <h2 className="font-display text-lg font-bold text-ink">Nuevo ticket</h2>
        <label htmlFor="ticket-subject" className="font-medium text-ink">
          Asunto
        </label>
        <input
          id="ticket-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={150}
          className="h-11 rounded-[10px] border border-line-strong px-3 text-ink"
        />
        <label htmlFor="ticket-body" className="font-medium text-ink">
          Mensaje
        </label>
        <textarea
          id="ticket-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={5}
          className="rounded-[10px] border border-line-strong p-3 text-ink"
        />
        {error ? <p className="rounded-[10px] bg-danger-bg px-3 py-2 text-danger-ink">{error}</p> : null}
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex h-12 items-center justify-center rounded-[10px] bg-accent px-6 font-semibold text-white disabled:opacity-50"
        >
          Enviar ticket
        </button>
      </form>
    </div>
  );
}
```
Nota: si `bg-accent`/`text-white` no coincide con el token del botón primario real, copiar la clase del botón primario de `payment-form.tsx`.

- [ ] **Step 4: `ticket-thread.tsx`** (detalle + responder)

```tsx
"use client";

import { useState } from "react";
import { TicketMessages } from "@/components/ticket-messages";
import { replyTicket, type TicketDetailView } from "@/lib/support-client";

export function TicketThread({ initial }: { initial: TicketDetailView }) {
  const [ticket, setTicket] = useState(initial);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 1 || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await replyTicket(ticket.id, body.trim());
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTicket(result.data);
    setBody("");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">{ticket.subject}</h1>
        <span className="rounded-full bg-bg px-3 py-1 text-sm font-semibold text-ink">
          {ticket.status === "OPEN" ? "Abierto" : "Cerrado"}
        </span>
      </div>
      <TicketMessages messages={ticket.messages} />
      {ticket.status === "OPEN" ? (
        <form onSubmit={handleReply} className="flex flex-col gap-3 border-t border-line-soft pt-5">
          <label htmlFor="reply-body" className="font-medium text-ink">
            Tu respuesta
          </label>
          <textarea
            id="reply-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={4}
            className="rounded-[10px] border border-line-strong p-3 text-ink"
          />
          {error ? <p className="rounded-[10px] bg-danger-bg px-3 py-2 text-danger-ink">{error}</p> : null}
          <button
            type="submit"
            disabled={body.trim().length < 1 || submitting}
            className="flex h-12 items-center justify-center self-start rounded-[10px] bg-accent px-6 font-semibold text-white disabled:opacity-50"
          >
            Enviar respuesta
          </button>
        </form>
      ) : (
        <p className="rounded-[10px] bg-bg px-4 py-3 text-muted">
          Ticket cerrado. Abre uno nuevo si necesitas más ayuda.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Páginas**

`frontend/src/app/tickets/page.tsx`
```tsx
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TicketsScreen } from "@/components/tickets-screen";
import { listTickets } from "@/lib/support-client";

export default async function TicketsPage() {
  const result = await listTickets();

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[1200px] px-6 py-10">
          {!result.ok ? (
            <p className="text-danger-ink">{result.message}</p>
          ) : (
            <TicketsScreen initial={result.data.items} />
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

`frontend/src/app/tickets/[id]/page.tsx`
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TicketThread } from "@/components/ticket-thread";
import { getTicket } from "@/lib/support-client";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getTicket(id);
  if (!result.ok && result.status === 404) {
    notFound();
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[800px] px-6 py-10">
          <Link href="/tickets" className="mb-4 inline-flex min-h-11 items-center text-sm font-medium text-muted">
            ← Volver a mis tickets
          </Link>
          {!result.ok ? <p className="text-danger-ink">{result.message}</p> : <TicketThread initial={result.data} />}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 6: Typecheck, lint y build**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores nuevos (la regla de variable sin usar para `_messages` se resuelve con el `void`; si el lint se queja, construir `summary` con los campos explícitos `{id, subject, status, createdAt, updatedAt}`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ticket-messages.tsx frontend/src/components/tickets-screen.tsx frontend/src/components/ticket-thread.tsx frontend/src/app/tickets
git commit -m "Frontend: /tickets y /tickets/[id] con hilo y respuesta (S9)"
```

---

### Task 5: Frontend — panel admin (S11 solo tickets)

**Files:**
- Create: `frontend/src/components/admin-support-queue.tsx`, `admin-ticket-detail.tsx`, `frontend/src/app/admin/soporte/page.tsx`
- Modify: `frontend/src/components/admin-sidebar.tsx`, `frontend/src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: Task 3 admin client; `TicketMessages` (Task 4).
- Produces: `<AdminSupportQueue initialTickets={AdminTicketSummary[]} />`, `<AdminTicketDetailPanel ticketId onChanged />`.

- [ ] **Step 1: `admin-ticket-detail.tsx`** (carga su propio detalle; se remonta con `key`)

```tsx
"use client";

import { useEffect, useState } from "react";
import { TicketMessages } from "@/components/ticket-messages";
import {
  closeAdminTicket,
  getAdminTicket,
  replyAdminTicket,
  type AdminTicketDetail,
} from "@/lib/support-admin-client";

export function AdminTicketDetailPanel({
  ticketId,
  onClosed,
  onError,
}: {
  ticketId: string;
  onClosed: (subject: string) => void;
  onError: (message: string) => void;
}) {
  const [ticket, setTicket] = useState<AdminTicketDetail | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAdminTicket(ticketId).then((result) => {
      if (cancelled) return;
      if (result.ok) setTicket(result.data);
      else onError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [ticketId, onError]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 1 || submitting) return;
    setSubmitting(true);
    const result = await replyAdminTicket(ticketId, body.trim());
    setSubmitting(false);
    if (!result.ok) {
      onError(result.message);
      return;
    }
    setTicket(result.data);
    setBody("");
  }

  async function handleClose() {
    if (!ticket || submitting) return;
    setSubmitting(true);
    const result = await closeAdminTicket(ticketId);
    setSubmitting(false);
    if (!result.ok) {
      onError(result.message);
      return;
    }
    onClosed(ticket.subject);
  }

  if (!ticket) {
    return (
      <section aria-label="Detalle del ticket" className="flex-1 rounded-2xl border border-line-soft bg-surface p-6">
        <p className="text-muted">Cargando…</p>
      </section>
    );
  }

  return (
    <section aria-label="Detalle del ticket" className="flex-1 rounded-2xl border border-line-soft bg-surface p-6">
      <div className="mb-5">
        <p className="font-display text-xl font-bold text-ink">{ticket.subject}</p>
        <p className="text-sm text-muted">{ticket.customerName ?? ticket.customerEmail}</p>
      </div>
      <TicketMessages messages={ticket.messages} />
      <form onSubmit={handleReply} className="mt-5 flex flex-col gap-3 border-t border-line-soft pt-5">
        <label htmlFor="admin-reply" className="font-medium text-ink">
          Responder
        </label>
        <textarea
          id="admin-reply"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          className="rounded-[10px] border border-line-strong p-3 text-sm text-ink"
        />
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={body.trim().length < 1 || submitting}
            className="flex h-12 flex-1 items-center justify-center rounded-[10px] bg-success-ink px-6 text-base font-semibold text-white disabled:opacity-50"
          >
            Enviar respuesta
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="flex h-12 items-center justify-center rounded-[10px] border border-line-strong px-6 text-base font-semibold text-ink disabled:opacity-50"
          >
            Cerrar ticket
          </button>
        </div>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: `admin-support-queue.tsx`**

```tsx
"use client";

import { useCallback, useState } from "react";
import { AdminTicketDetailPanel } from "@/components/admin-ticket-detail";
import { fetchAdminTickets, type AdminTicketSummary } from "@/lib/support-admin-client";

export function AdminSupportQueue({ initialTickets }: { initialTickets: AdminTicketSummary[] }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedId, setSelectedId] = useState<string | null>(initialTickets[0]?.ticketId ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((msg: string) => setError(msg), []);

  async function handleClosed(subject: string) {
    const result = await fetchAdminTickets("OPEN");
    const fresh = result.ok ? result.data.items : tickets;
    if (!result.ok) setError(result.message);
    setTickets(fresh);
    setSelectedId(fresh[0]?.ticketId ?? null);
    setError(null);
    setMessage(`Ticket "${subject}" cerrado.`);
  }

  return (
    <div className="flex flex-col gap-4">
      {message ? (
        <div className="rounded-[10px] bg-success-bg px-4 py-3 font-medium text-success-ink">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-[10px] bg-danger-bg px-4 py-3 font-medium text-danger-ink">{error}</div>
      ) : null}
      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-line-soft bg-surface p-14 text-center">
          <p className="font-display text-xl font-bold text-ink">Sin tickets abiertos</p>
          <p className="mt-1 text-muted">Cuando un cliente escriba a soporte, aparecerá aquí.</p>
        </div>
      ) : (
        <>
          <p className="text-muted">{tickets.length} abiertos</p>
          <div className="flex flex-wrap items-start gap-5">
            <section aria-label="Cola de tickets" className="flex w-full max-w-[360px] flex-col gap-2">
              {tickets.map((t) => {
                const active = t.ticketId === selectedId;
                return (
                  <button
                    key={t.ticketId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(t.ticketId);
                      setError(null);
                      setMessage(null);
                    }}
                    className={`flex min-h-11 flex-col gap-1 rounded-xl border-2 px-4 py-3 text-left ${
                      active ? "border-accent bg-accent-soft-bg" : "border-line-soft bg-surface"
                    }`}
                  >
                    <span className="font-semibold text-ink">{t.subject}</span>
                    <span className="text-sm text-muted">{t.customerName ?? t.customerEmail}</span>
                    <span className="text-sm text-muted">{t.messageCount} mensajes</span>
                  </button>
                );
              })}
            </section>
            {selectedId ? (
              <AdminTicketDetailPanel
                key={selectedId}
                ticketId={selectedId}
                onClosed={handleClosed}
                onError={handleError}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Página** — `frontend/src/app/admin/soporte/page.tsx`

```tsx
import { AdminSupportQueue } from "@/components/admin-support-queue";
import { fetchAdminTickets } from "@/lib/support-admin-client";

export default async function AdminSoportePage() {
  const result = await fetchAdminTickets("OPEN");

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-bold text-ink">Soporte</h1>
      {!result.ok ? (
        <p className="text-danger-ink">{result.message}</p>
      ) : (
        <AdminSupportQueue initialTickets={result.data.items} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Sidebar y layout con badge**

`admin-sidebar.tsx`: añadir a `NAV_ITEMS` `{ href: "/admin/soporte", label: "Soporte", badgeKey: "tickets" as const },` (después de Reclamos); nueva prop `pendingTicketsCount: number`; `counts` pasa a `{ payments: pendingPaymentsCount, claims: pendingClaimsCount, tickets: pendingTicketsCount }`.

`admin/layout.tsx`: importar `fetchAdminTickets` de `@/lib/support-admin-client`; en `Promise.all` añadir `fetchAdminTickets("OPEN", 1)` como `ticketsResult`; `const pendingTicketsCount = ticketsResult.ok ? ticketsResult.data.total : 0;` y pasar `pendingTicketsCount={pendingTicketsCount}` a `<AdminSidebar>`.

- [ ] **Step 5: Typecheck, lint y build**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build && npx vitest run`
Expected: PASS. (El `useEffect` con setState asíncrono dentro de `.then` es válido; si `react-hooks` marca `onError` en deps, está estabilizado con `useCallback` en el padre.)

- [ ] **Step 6: Verificación manual en navegador**

Backend (`npm run start:dev`) + frontend (`npm run dev -- --port 3001`), con seed: (1) cliente crea ticket en `/tickets` → aparece "Abierto"; (2) admin ve badge 1 en "Soporte", abre el ticket, responde; (3) cliente recarga `/tickets/[id]` y ve la respuesta como "Soporte Free Cell"; (4) admin cierra → cola vacía y banner; (5) cliente ve "Ticket cerrado…" sin caja de respuesta; (6) `/tickets` sin sesión redirige a `/login`. Reportar lo que no se pudo verificar.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/admin-support-queue.tsx frontend/src/components/admin-ticket-detail.tsx frontend/src/app/admin/soporte frontend/src/components/admin-sidebar.tsx frontend/src/app/admin/layout.tsx
git commit -m "Frontend: /admin/soporte con cola, hilo, respuesta y cierre, badge en sidebar (S11)"
```

---

### Task 6: Documentación y cierre

**Files:**
- Modify: `docs/02-requerimientos-funcionales.md` (RF-SUP-01..04 líneas ~174-177 y RF-ADM-44 línea ~151: ⬜ → ✅)
- Modify: `docs/06-api.md` (filas líneas ~50-52 y ~86-88 ⬜ → ✅; añadir filas `GET /support-tickets/:id` y `GET /admin/support-tickets/:id`)
- Modify: `docs/10-orden-de-ejecucion.md` (paso 8 ✅ con fecha; "Próximo": paso 9 reseñas S11; ajustar línea de Estado)
- Modify: `docs/07-diseno-ui.md` solo si la ruta `/admin/soporte` o S11 cambia (S11 queda parcial: falta pestaña de reseñas, indicarlo)
- Modify: `CLAUDE.md` raíz (sección Estado: soporte/tickets ✅; quitar "soporte (tickets)" de la lista de ⬜ Sprints 2–4)

- [ ] **Step 1: Actualizar los docs** según la lista (usar `Grep` para ubicar las filas exactas antes de editar).

- [ ] **Step 2: Suite completa final**

Run: `cd backend && npm run typecheck && npm test && npm run test:e2e -- --runInBand` y `cd ../frontend && npx vitest run && npm run build`
Expected: todo PASS.

- [ ] **Step 3: Commit**

```bash
git add docs CLAUDE.md
git commit -m "Docs: cierre de soporte por tickets (S9/S11) en RF-SUP, RF-ADM-44, docs/06 y orden de ejecucion"
```

- [ ] **Step 4: Integración** — usar `superpowers:finishing-a-development-branch`. Recordatorio de memoria del proyecto: mergear a `main` pero **no borrar** la rama de feature y dejarla pusheada (solo cuando el usuario lo pida).

---

## Self-Review

- **Cobertura del spec**: RF-SUP-01 (Task 1 create), 02 (list/detail/reply), 03 (Task 2 + Task 5), 04 (409 en `appendMessage` + UI cerrado); RF-ADM-44 (Task 2/5); auditoría `ticket.created`/`ticket.closed` (Tasks 1–2); endpoints de detalle (Tasks 1–2); concurrencia cierre vs. mensaje (Task 2); proxy y header (`/tickets` ya enlazado, protegido en Task 3); docs (Task 6).
- **Placeholders**: ninguno; el único condicional es la clase de botón primario (nota en Task 4 Step 3) y el nombre de columnas de `audit_logs` (nota en Task 1 Step 7), ambos con instrucción concreta.
- **Consistencia de tipos**: `appendMessage`/`loadTicketMessages` (Task 1) usados con la misma firma en Task 2; `TicketMessageView` (Task 3) usada en Tasks 4–5; campos de cola/detalle admin coinciden entre DTO backend, tests y `AdminTicketSummary`/`AdminTicketDetail`.
