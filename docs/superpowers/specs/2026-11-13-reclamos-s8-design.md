# Reclamos y reposición de licencia (S8) — diseño

**Fecha**: 2026-11-13
**Sprint**: 3/4 (backend + frontend, admin + cliente)
**Paso del roadmap**: #7 en `docs/10-orden-de-ejecucion.md`
**Decisiones relacionadas**: D25 (ventana de reposición: 7 días desde la entrega), D26 (máx. 1 reposición por
pedido; sin stock, el pedido espera el próximo lote, sin reembolso automático), D27 (reembolso manual — **fuera
de alcance de este paso**), D28 (modelo del reemplazo: `license_items.replacesId` + `orderItemId` se reasigna de
la original `VOID` a la nueva), D57 (lógica crítica también en Postgres), D73 (reveal: 20/min por IP, ya cubre
cualquier reveal posterior al reemplazo porque no se toca ese endpoint).

## Contexto

El modelo de datos de `claims` ya existe desde Fundaciones (`backend/src/database/entities/claim.entity.ts`,
`ClaimStatus` en `database/enums.ts`): columnas `orderId`, `licenseItemId`, `userId`, `reason`, `status`,
`replacementLicenseId`, `resolvedById`, `resolvedAt`, e índice único parcial `WHERE status = 'OPEN'` por
`orderId` (invariante 6 de `docs/05`). No existe ningún módulo NestJS (`src/claims/`) ni pantalla real — el
placeholder actual es `frontend/src/app/admin/reclamos/page.tsx` (una línea, "pantalla real en S8").

Mockup de referencia: `docs/design/artboards/AdminReclamos.dc.html` (maestro-detalle, igual estructura que
`AdminPagos.dc.html`: cola a la izquierda, detalle a la derecha, avance automático al siguiente). El botón
"Rechazar reclamo" del mockup no pide motivo — se ignora ese detalle porque `docs/06-api.md` ya fija
`POST /admin/claims/:id/reject` con body `{reason}` (los mockups son solo referencia visual, no contrato).

Backend S4 (`/pedidos`) ya construyó `OrderResponseDto`/`OrderItemResponseDto` con `productName`/`planName`, y
`POST /orders/:id/license/reveal` ya devuelve `{orderItemId, planId, secret}` por cada licencia `SOLD` del
pedido — ambos se reutilizan tal cual.

### Decisiones tomadas en esta sesión

1. **Alcance solo M**: RF-REC-01..05 + RF-ADM-30..32 + auditoría (`claim.created`/`claim.resolved`/
   `claim.rejected`). **Fuera**: RF-REC-06 (reembolso manual, D27, prioridad S) y RF-NOT-05 (correo al resolver,
   prioridad S) — mismo criterio que dejó RF-PED-05/06 fuera en S4.
2. **El cliente elige qué licencia reclama**: `POST /claims` recibe `{orderId, orderItemId, reason}` —
   `orderItemId`, no `licenseItemId` (ese es un detalle interno que el cliente nunca ve). Se agrega
   `orderItemId` a `OrderItemResponseDto`/`OrderItemView` (hoy esas respuestas no tienen ningún identificador de
   línea). El service resuelve `orderItemId` → licencia `SOLD` vigente → `licenseItemId` real con el mismo JOIN
   que ya usa `revealLicenses`. Si el pedido tiene una sola licencia, el frontend autoselecciona esa línea y el
   campo es invisible para el usuario.
3. **Sin reveal para el admin**: la cola de reclamos (`GET /admin/claims`) nunca descifra la clave — se muestra
   siempre enmascarada, sin acción de revelar. El admin decide por el motivo del cliente y el stock disponible,
   no por el valor de la clave (minimiza superficie de descifrado, regla de dominio 4).
4. **Rechazo con motivo libre, no catálogo fijo**: a diferencia de `RejectPaymentDto` (enum
   `PaymentRejectionReason` con 3 motivos predefinidos ya acordados en un sprint anterior), el rechazo de un
   reclamo usa texto libre (`@IsString() @MinLength(3)`). No hay una lista de motivos de reclamo ya decidida en
   `docs/09`, y no corresponde inventar copy de negocio sin que el usuario la valide; se puede migrar a enum más
   adelante si se decide una lista fija.
5. **`claims.rejectionReason` es columna nueva** (migración nueva, no se toca `InitialSchema` ya aplicada):
   mismo patrón que `payments.rejectionReason`, visible al cliente en `GET /claims` (coherente con que los
   pagos sí muestran por qué se rechazaron).
6. **La reposición reutiliza el reveal existente sin cambios**: `fn_resolve_claim` reasigna el **mismo**
   `orderItemId` a la licencia de reemplazo (la original pasa a `VOID` conservando su `orderItemId` histórico,
   per D28/docs/05). Como `revealLicenses` ya filtra `license_items.status = 'SOLD'` por `orderItemId`, el
   cliente obtiene la clave nueva la próxima vez que revela — sin tocar `orders.service.ts` para nada de esto.
7. **Ventana de 7 días usa `orders.updatedAt`**: no hay columna `deliveredAt` real (ver nota del mismo
   compromiso ya asumido por `OrderResponseDto.tracking.deliveredAt` en S4); una vez `DELIVERED` nada más
   actualiza esa fila, así que `updatedAt` es un proxy seguro. No se agrega columna nueva para esto (YAGNI).
8. **Validación de reglas de negocio en el service, no en una función SQL de creación**: a diferencia de
   aprobar/rechazar pago (que sí tienen función SQL porque son secuencias atómicas de varios `UPDATE`), crear un
   reclamo es una sola inserción con chequeos previos — se hace en TypeScript dentro de una transacción con
   `SELECT ... FOR UPDATE` sobre el pedido (serializa reclamos concurrentes del mismo pedido), igual estilo que
   `OrdersService.create()`. Los mensajes de error específicos (ventana vencida, reclamo ya abierto, reposición
   ya usada) quedan como `ConflictException` con texto claro — un `RAISE EXCEPTION`/P0001 perdería el mensaje
   específico porque `AllExceptionsFilter` lo reemplaza siempre por uno genérico. El índice único parcial queda
   como respaldo de concurrencia (23505 → 409 genérico, caso raro de doble-click exacto).
9. **`fn_resolve_claim`/`fn_reject_claim` sí son funciones SQL** (igual patrón que `fn_approve_payment`/
   `fn_reject_payment`): resolver mezcla el `SKIP LOCKED` sobre `license_items` con varios `UPDATE` que deben
   commitear juntos — ahí sí aplica D57 igual que en pagos.

## Modelo de datos (migración nueva `ClaimFunctions`, no toca migraciones aplicadas)

```sql
ALTER TABLE claims ADD COLUMN "rejectionReason" text NULL;

CREATE OR REPLACE FUNCTION fn_resolve_claim(p_claim_id uuid, p_admin_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
  -- Busca 1 license_item AVAILABLE del mismo planId que la licencia reclamada (FOR UPDATE SKIP LOCKED).
  -- Sin stock -> RETURN 'NO_STOCK' (no toca nada, el reclamo sigue OPEN).
  -- Con stock -> UPDATE original SET status='VOID' (conserva orderItemId histórico);
  --             UPDATE nueva SET status='SOLD', "orderItemId"=<el mismo>, "replacesId"=original.id;
  --             UPDATE claims SET status='RESOLVED', "replacementLicenseId"=nueva.id,
  --                                "resolvedById"=p_admin_id, "resolvedAt"=now();
  --             RETURN 'RESOLVED'.
  -- Claim no existe o no está OPEN -> RETURN NULL / RAISE EXCEPTION (mismo criterio que fn_reject_payment).
$$;

CREATE OR REPLACE FUNCTION fn_reject_claim(p_claim_id uuid, p_admin_id uuid, p_reason text)
RETURNS boolean LANGUAGE plpgsql AS $$
  -- Claim no existe -> RETURN false. No está OPEN -> RAISE EXCEPTION (igual que pagos: 409 genérico).
  -- OPEN -> UPDATE status='REJECTED', "rejectionReason"=p_reason, "resolvedById"=p_admin_id, "resolvedAt"=now();
  --         RETURN true.
$$;
```

## API

### Lado cliente — módulo `src/claims/` (`ClaimsController`, prefix `/claims`)

| Método | Ruta | Body/Query | Notas |
|---|---|---|---|
| `POST` | `/claims` | `{orderId, orderItemId, reason}` | 403 si el pedido no es `DELIVERED`; 404 si pedido/ítem no es del usuario; 409 fuera de ventana (7 días, D25), reclamo `OPEN` ya existe, o pedido ya usó su reposición (D26). Éxito → 201, audita `claim.created`. |
| `GET` | `/claims?page&pageSize` | — | "Mis reclamos": `{id, orderId, orderNumber, status, reason, rejectionReason, createdAt, resolvedAt}[]`, paginado igual que `/orders`. |

### Lado admin — `AdminClaimsController` (prefix `/admin/claims`, mismo patrón que `admin-payments`)

| Método | Ruta | Body/Query | Notas |
|---|---|---|---|
| `GET` | `/admin/claims?status=&page&pageSize` | — | Cola: `{claimId, orderId, orderNumber, status, reason, productName, planName, availableStock, createdAt, customerName, customerEmail}[]`. Nunca incluye la clave. |
| `POST` | `/admin/claims/:id/replace` | — | `fn_resolve_claim`. `NO_STOCK` → 409 ("sin stock para reponer; el pedido queda en espera del próximo lote"). Éxito → audita `claim.resolved`, devuelve `{claimId, status, orderNumber}`. |
| `POST` | `/admin/claims/:id/reject` | `{reason}` (texto libre) | `fn_reject_claim`. Audita `claim.rejected`, devuelve `{claimId, status, orderNumber}`. |

Cambio adicional: `OrderItemResponseDto` (en `backend/src/orders/dto/order-response.dto.ts`) agrega
`orderItemId: string` — necesario para que el cliente pueda referenciar una línea específica al crear un
reclamo. Se usa el helper `planLabelsFor` existente sin cambios; el `id` del `OrderItem` ya está disponible en
el array que `OrdersService` le pasa a `OrderResponseDto.from`.

## Flujo completo

```
Cliente — extensión de /pedidos (OrderDetailPanel, ya existe desde S4)
  - Si order.status === 'DELIVERED': por cada ítem, debajo del bloque de clave:
      - Sin reclamo para ese orderItemId → link "Reportar un problema" → abre textarea de motivo inline
        → POST /claims {orderId, orderItemId, reason} → éxito: banner "Tu reclamo está en revisión"
      - Reclamo OPEN → banner "Tu reclamo está en revisión" (sin botón de reportar otro)
      - Reclamo RESOLVED → sin banner extra (la clave ya revelada es la de reemplazo automáticamente)
      - Reclamo REJECTED → banner con rejectionReason + ya no se puede reclamar ese pedido otra vez (D26)
  - listClaims() se pide junto con listOrders() al entrar a /pedidos, se cruza por orderId en el cliente

Admin — /admin/reclamos (reemplaza el placeholder)
  - GET /admin/claims?status=OPEN&pageSize=50 al entrar → <AdminClaimsQueue>
  - Cola a la izquierda (cliente, producto/plan, "hace N h"), detalle a la derecha:
      motivo del cliente, clave oculta (sin reveal), "Stock para reponer: quedan N licencias"
  - "Entregar reemplazo" → POST .../replace
      éxito → refetch cola → autoselecciona el siguiente → banner verde
      NO_STOCK (409) → banner rojo "Sin stock para reponer; el pedido queda en espera" (no avanza, sigue OPEN)
  - "Rechazar reclamo" → abre textarea de motivo; "Confirmar rechazo" deshabilitado hasta escribir algo
      confirmar → POST .../reject {reason} → refetch cola → autoselecciona siguiente → banner
  - Enlace "Escribir por WhatsApp" con el customerEmail/teléfono si existe (mismo wa.me del mockup, con
    placeholder [NÚMERO] igual que el resto del proyecto)
  - Cola vacía → "Sin reclamos abiertos. Cuando un cliente reporte una clave inválida, aparecerá aquí."
```

## Componentes y archivos nuevos

| Archivo | Responsabilidad |
|---|---|
| `backend/src/database/migrations/<ts>-ClaimFunctions.ts` | `ALTER TABLE claims ADD "rejectionReason"`; `fn_resolve_claim`, `fn_reject_claim` |
| `backend/src/orders/dto/order-response.dto.ts` | `OrderItemResponseDto` gana `orderItemId` |
| `backend/src/claims/dto/create-claim.dto.ts` | `{orderId, orderItemId, reason}` con `class-validator` |
| `backend/src/claims/dto/claim-response.dto.ts` | DTO de "mis reclamos" |
| `backend/src/claims/dto/list-claims-query.dto.ts` | Paginación (igual `ListOrdersQueryDto`) |
| `backend/src/claims/dto/admin-claim-response.dto.ts` | DTO de la cola admin (incluye `availableStock`) |
| `backend/src/claims/dto/list-admin-claims-query.dto.ts` | Paginación + `status` (igual `ListAdminPaymentsQueryDto`) |
| `backend/src/claims/dto/reject-claim.dto.ts` | `{reason: string}` libre |
| `backend/src/claims/claims.service.ts` | `create()`, `listForUser()` |
| `backend/src/claims/claims.controller.ts` | `/claims` |
| `backend/src/claims/admin-claims.service.ts` | `list()`, `replace()`, `reject()` |
| `backend/src/claims/admin-claims.controller.ts` | `/admin/claims` |
| `backend/src/claims/claims.module.ts` | Registra ambos controllers/services; se importa en `app.module.ts` |
| `frontend/src/lib/orders-client.ts` | `OrderItemView` gana `orderItemId` |
| `frontend/src/lib/claims-client.ts` | `createClaim(orderId, orderItemId, reason)`, `listClaims()` — mismo patrón que `orders-client.ts` |
| `frontend/src/lib/claims-admin-client.ts` | `fetchAdminClaims(status?)`, `replaceClaim(id)`, `rejectClaim(id, reason)` — mismo patrón que `admin-payments-client.ts` |
| `frontend/src/components/orders-screen.tsx` | `OrderDetailPanel` agrega el bloque "Reportar un problema"/estado del reclamo |
| `frontend/src/app/pedidos/page.tsx` | Suma `listClaims()` al fetch inicial |
| `frontend/src/app/admin/reclamos/page.tsx` | Reemplaza el placeholder: server component, fetch inicial, `<AdminClaimsQueue>` |
| `frontend/src/components/admin-claims-queue.tsx` | Cola + detalle + flujo de rechazo + refetch + auto-avance (copia estructural de `admin-payments-queue.tsx`) |
| `frontend/src/components/admin-claim-detail.tsx` | Detalle del reclamo seleccionado (copia estructural de `admin-payment-detail.tsx`) |

Tocado, sin archivo nuevo: `backend/src/app.module.ts` (importa `ClaimsModule`). `proxy.ts` no cambia —
`/admin/*` ya está protegido por rol.

## Manejo de errores

| Origen | Código | UI |
|---|---|---|
| `POST /claims` | 403 (no `DELIVERED`) | Mensaje inline, no debería ocurrir (el botón solo aparece si `DELIVERED`) |
| `POST /claims` | 409 (ventana vencida / ya abierto / ya usó reposición) | Mensaje inline específico del backend, sin reintento automático |
| `POST /admin/claims/:id/replace` | 409 `NO_STOCK` | Banner rojo "Sin stock para reponer; el pedido queda en espera" + refetch (sigue en la cola) |
| `POST /admin/claims/:id/replace` o `/reject` | 404/409 (ya resuelto por otro admin) | Banner rojo + refetch (resincroniza, mismo criterio que pagos) |
| `POST /admin/claims/:id/reject` sin motivo escrito | — | "Confirmar rechazo" deshabilitado |

## Testing

- **E2E backend** (`backend/test/claims.e2e-spec.ts`, Postgres/Redis reales):
  - Creación válida (pedido `DELIVERED`, dentro de ventana, sin reclamo previo) → 201, `claims` tiene 1 fila
    `OPEN`.
  - 403 pedido no `DELIVERED`; 404 pedido/ítem ajeno; 409 fuera de ventana (fixture con `updatedAt` > 7 días);
    409 reclamo `OPEN` ya existe; 409 pedido ya tiene un reclamo `RESOLVED` previo (D26).
  - Concurrencia: dos `POST /claims` simultáneos sobre el mismo pedido → solo uno crea, el otro 409 (índice
    único parcial como respaldo).
  - `fn_resolve_claim` con stock: licencia original `VOID`, nueva `SOLD` con el mismo `orderItemId`,
    `replacesId` apunta a la original; `POST /orders/:id/license/reveal` posterior devuelve la clave **nueva**.
  - `fn_resolve_claim` sin stock: devuelve `NO_STOCK`, claim sigue `OPEN`, nada cambia en `license_items`.
  - `fn_reject_claim`: marca `REJECTED` + `rejectionReason`; reintentar sobre ya resuelto → 409 genérico.
  - `GET /claims` y `GET /admin/claims` con paginación y filtro por `status`.
- **Frontend unit** (Vitest, estilo `orders-client.test.ts`): `claims-client.test.ts`,
  `claims-admin-client.test.ts` — cubren los endpoints y sus códigos de error.
- **Verificación manual en navegador** (mismo método usado en S4: backend+frontend dev reales, Playwright o
  interacción directa): flujo cliente completo (reportar → "en revisión") y flujo admin completo (ver cola →
  entregar reemplazo → el cliente revela y ve la clave nueva), más el caso de rechazo y el caso sin stock.

## Fuera de alcance (explícitamente diferido)

- RF-REC-06: reembolso manual (D27).
- RF-NOT-05: correo al resolver un reclamo (el envío real de notificaciones en cola sigue pendiente en general,
  igual que se dejó en S6).
- RF-PED-06 (guía "cómo activar"): sigue fuera, ya difería desde S4.
- Reveal para el admin de la clave reclamada (decisión explícita: enmascarada siempre).
- Catálogo fijo de motivos de rechazo de reclamo (texto libre por ahora).
- `AdminInicio` (S5): la tarjeta "reclamos abiertos" del resumen del día no es parte de este paso.

## Documentación a actualizar al cerrar

- `docs/02-requerimientos-funcionales.md`: RF-REC-01..05, RF-ADM-30..32 ⬜ → ✅ con fecha de cierre.
- `docs/06-api.md`: filas de `/claims` y `/admin/claims` ⬜ → ✅; nota de `orderItemId` nuevo en `items[]` de
  `GET /orders`.
- `docs/05-modelo-de-datos.md`: nota de la columna `claims.rejectionReason` agregada.
- `docs/10-orden-de-ejecucion.md`: marcar paso 7 ✅ con fecha; siguiente paso pasa a ser el 8 (soporte/tickets,
  S9/S11).
