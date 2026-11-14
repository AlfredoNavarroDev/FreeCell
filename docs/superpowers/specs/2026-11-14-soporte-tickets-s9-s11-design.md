# Soporte por tickets (S9 cliente / S11 admin) — diseño

**Fecha**: 2026-11-14
**Paso del roadmap**: #8 en `docs/10-orden-de-ejecucion.md`
**Decisiones relacionadas**: D34 (sistema de tickets propio, `support_tickets` + `ticket_messages`, además de
`claims`), D57 (lógica crítica en Postgres cuando hay stock/dinero/estado crítico).

## Contexto

Las entidades `SupportTicket` y `TicketMessage` y el enum `TicketStatus` (`OPEN`/`CLOSED`) existen desde
Fundaciones; no hay módulo NestJS ni pantallas (el header ya enlaza `/tickets`, que hoy no tiene ruta). Se
copia la estructura del módulo de reclamos (S8): `src/claims/` → `src/support/`, y sus clientes/pantallas.

### Decisiones tomadas en esta sesión

1. **Alcance**: RF-SUP-01..04 y RF-ADM-44. **Fuera**: pestaña de reseñas de S11 (paso 9), correo/WhatsApp
   automático al responder (RF-NOT, notificaciones reales siguen pendientes), adjuntos, prioridades, asignación
   entre admins.
2. **Sin migración**: las tablas ya cubren el modelo. La regla "ticket cerrado no acepta mensajes" se valida en
   el service con `SELECT ... FOR UPDATE` sobre el ticket (serializa cierre vs. mensaje concurrente). No hay
   stock ni dinero en juego, así que no se crea función SQL (D57 no lo exige).
3. **Se agregan dos endpoints de detalle** no listados en `docs/06`: `GET /support-tickets/:id` (cliente, solo
   propios, con mensajes) y `GET /admin/support-tickets/:id` (admin, con mensajes). Son necesarios para S9/S11
   (historial). La lista no incluye mensajes.
4. **Validación**: `subject` 3–150 caracteres (columna `varchar(150)`), `body` 1–2000 (texto trim).
5. **Admin también recibe 409** si intenta responder a un ticket `CLOSED` (consistencia). Cerrar un ticket ya
   cerrado → 409.
6. **Auditoría**: `ticket.created` y `ticket.closed` (mutaciones con efecto de estado). Los mensajes no se
   auditan (son contenido, ya quedan en `ticket_messages`).
7. **Orden de cola admin**: más antiguo primero (igual que reclamos); filtro `status` opcional, default sin
   filtro en API, el frontend pide `OPEN`.
8. **Propiedad**: un cliente nunca ve tickets ajenos → 404 (no 403) para no filtrar existencia.

## API

### Cliente — `SupportController` (prefix `/support-tickets`)

| Método | Ruta | Body | Notas |
|---|---|---|---|
| `POST` | `/support-tickets` | `{subject, body}` | Crea ticket `OPEN` + primer mensaje (`isAdmin=false`) en una transacción. 201. Audita `ticket.created`. |
| `GET` | `/support-tickets?page&pageSize` | — | Mis tickets: `{id, subject, status, createdAt, updatedAt}[]` paginado, más reciente actividad primero (`updatedAt DESC`). |
| `GET` | `/support-tickets/:id` | — | Detalle `{id, subject, status, createdAt, updatedAt, messages:[{id, body, isAdmin, createdAt}]}`; 404 si no es mío. |
| `POST` | `/support-tickets/:id/messages` | `{body}` | 404 si no es mío; 409 si `CLOSED`. Devuelve el detalle actualizado. Toca `updatedAt` del ticket. |

### Admin — `AdminSupportController` (prefix `/admin/support-tickets`, `@Roles(Role.ADMIN)`)

| Método | Ruta | Body/Query | Notas |
|---|---|---|---|
| `GET` | `/admin/support-tickets?status=&page&pageSize` | — | Cola: `{ticketId, subject, status, customerName, customerEmail, messageCount, lastMessageAt, createdAt}[]`. |
| `GET` | `/admin/support-tickets/:id` | — | Detalle con mensajes, más datos del cliente. 404 si no existe. |
| `POST` | `/admin/support-tickets/:id/messages` | `{body}` | `isAdmin=true`. 404 / 409 si `CLOSED`. Devuelve detalle. |
| `POST` | `/admin/support-tickets/:id/close` | — | `OPEN`→`CLOSED`. 404 / 409 si ya cerrado. Audita `ticket.closed`. Devuelve `{ticketId, status}`. |

## Frontend

- `lib/support-client.ts` (cliente): `createTicket(subject, body)`, `listTickets()`, `getTicket(id)`,
  `replyTicket(id, body)`.
- `lib/support-admin-client.ts`: `fetchAdminTickets(status)`, `getAdminTicket(id)`, `replyAdminTicket(id, body)`,
  `closeAdminTicket(id)`.
- `/tickets` (S9): lista con badge Abierto/Cerrado + formulario "Nuevo ticket" (asunto + mensaje). Requiere
  sesión; si el backend devuelve 401 se muestra el mensaje (el proxy ya protege rutas de cuenta; ver Tareas).
- `/tickets/[id]`: historial de mensajes (cliente vs. soporte), caja de respuesta si `OPEN`; si `CLOSED` aviso
  "Ticket cerrado. Abre uno nuevo si necesitas más ayuda." (RF-SUP-04).
- `/admin/soporte` (S11, solo tickets): cola a la izquierda, detalle con hilo a la derecha, responder y
  "Cerrar ticket"; tras cerrar se refetch y avanza al siguiente. Sidebar suma "Soporte" con badge de abiertos.
  Cola vacía: "Sin tickets abiertos."
- Accesibilidad: elementos nativos, objetivos ≥ 44 px, estado nunca solo por color (texto "Abierto"/"Cerrado").

## Testing

- E2E backend (`support.e2e-spec.ts`, `admin-support.e2e-spec.ts`): crear (201, ticket + 1 mensaje + audit),
  validación (asunto corto → 400), listar solo propios, detalle ajeno 404, responder, responder a `CLOSED` 409,
  admin lista/filtra/responde/cierra, cerrar dos veces 409, no-admin 403, concurrencia cierre vs. mensaje (uno
  gana, nunca un mensaje en ticket cerrado).
- Vitest de ambos clientes (mismo estilo que `claims-client.test.ts`).
- Verificación manual en navegador del flujo cliente→admin→cliente.

## Documentación a actualizar al cerrar

`docs/02` (RF-SUP-01..04, RF-ADM-44 ⬜→✅), `docs/06` (filas ✅ + los 2 endpoints de detalle), `docs/10` (paso 8
✅, próximo paso 9), `docs/09` si surge alguna decisión nueva, `CLAUDE.md` raíz (estado).
