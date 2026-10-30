# 06 · API REST

Base: `http://localhost:3000`. JSON. Autenticación: `Authorization: Bearer <JWT>`.
Errores: formato estándar de Nest `{ "statusCode", "message", "error" }`. `message` es texto en español apto para mostrar.
Códigos usados: 400 validación · 401 sin sesión · 403 rol insuficiente · 404 no existe · 409 conflicto de negocio (sin stock, duplicado) · 429 límite de uso.

**Leyenda de acceso:** 🌐 público · 👤 cliente autenticado (solo sus recursos) · 🛡️ ADMIN.
**Estado:** ✅ implementado · ⬜ pendiente.

## Implementados (Sprint 1 — Fundaciones)
Ver `docs/backend/auth.md`, `docs/backend/orders.md` y `docs/backend/README.md` para el detalle completo
(cuerpos, errores exactos, rate limits), verificado contra `backend/src/`.

| | Método y ruta | Acceso | Descripción |
|---|---|---|---|
| ✅ | `GET /health` | 🌐 | `{status:'ok'}` (liveness, sin throttling). |
| ✅ | `GET /health/ready` | 🌐 | Verifica Postgres y Redis (`@nestjs/terminus`); 503 si alguno falla. |
| ✅ | `GET /docs` | 🌐 | Swagger/OpenAPI, solo si `NODE_ENV !== 'production'`. |
| ✅ | `POST /auth/register` | 🌐 | Body `{email, password, name?}` → `201 {accessToken, refreshToken, user}`. `role` en el body da 400 (whitelist); 409 si el correo existe. |
| ✅ | `POST /auth/login` | 🌐 | Body `{email, password}` → `{accessToken, refreshToken, user}`. 401 genérico. |
| ✅ | `POST /auth/refresh` | 🌐 | Body `{refreshToken}` → `{accessToken, refreshToken}`. Rotación con ventana de gracia de 30 s (D56); reuso fuera de la ventana revoca toda la familia (401). |
| ✅ | `POST /auth/logout` | 👤 | Body `{refreshToken}` → 204. Revoca la familia del refresh token. |
| ✅ | `GET /auth/me` | 👤 | Perfil sin datos sensibles. |
| ✅ | `POST /auth/verify-email` | 🌐 | Body `{token}`. Marca `emailVerifiedAt`; 400 si el token es inválido o venció (RF-AUT-07). |
| ✅ | `POST /auth/resend-verification` | 👤 | Reemite el token si el correo aún no está verificado; 409 si ya lo está (RF-AUT-07). |
| ✅ | `POST /auth/google` | 🌐 | Body `{idToken}`, **verificado por el backend** (no se confía en que el frontend ya lo validó). Find-or-create por correo: nuevo → `role=CUSTOMER`, `emailVerifiedAt` automático; existente sin `googleId` → se vincula (D75, auditado). 401 si el token no es válido o Google no certifica el correo como verificado. Devuelve el mismo shape que `login`/`register` (`{accessToken, refreshToken, user}`). |
| ✅ | `POST /orders` | 👤 | Body `{currency, items:[{planId, qty}], toolUsername?}` → `201 {id, orderNumber, status, totalCents, currency, expiresAt, cancelReason, items}`. Reserva todos los ítems del carrito en una transacción (D30); 404 plan inactivo; 409 sin stock de un ítem (rechaza el carrito completo), plan sin precio en la moneda elegida, o cliente nuevo que supera el tope de D74; 403 si el correo no está verificado (RF-AUT-07); 400 moneda inválida o falta `toolUsername` requerido. |
| ✅ | `GET /orders/:id` | 👤 | Mismo shape que la creación. 404 si no es del usuario. |
| ✅ | `POST /orders/:id/cancel` | 👤 | Solo desde `PENDING_PAYMENT`; libera la reserva. 409 si no está en ese estado; 200 idempotente si ya estaba `CANCELLED`. |

## Catálogo (Sprint 2)
| | Ruta | Acceso | Notas |
|---|---|---|---|
| ✅ | `GET /catalog/products?query=&category=&currency=&page=&pageSize=` | 🌐 | Productos activos con `priceFromCents` (en la moneda pedida, PEN por defecto, D66), `categoryName` y `stockState` agregado (D69). `category` es el id de la categoría (D67). Paginado `{items, total, page, pageSize}`. |
| ✅ | `GET /catalog/products/:slug` | 🌐 | Ficha: `description`, `whatIncluded`, `compatibility`, `activationGuide`, `faq` (D68) y `plans: [{id, name, kind, durationDays, prices: [{currency, priceCents}], stockState}]`. Solo planes con al menos un precio. Nunca expone cantidad exacta (D29). 404 si el slug no existe o el producto está inactivo. |
| ✅ | `GET /catalog/categories` | 🌐 | `[{id, name}]` ordenadas por nombre. |

## Pedidos y pagos del cliente (Sprint 2)
| | Ruta | Acceso | Notas |
|---|---|---|---|
| ✅ | `GET /orders?status=` | 👤 | Mis pedidos, paginado (`page`/`pageSize`). |
| ✅ | `GET /orders/:id` | 👤 | Detalle + `tracking` (creado/pago aprobado/entregado) + `paymentStatus`. 404 si no es suyo. |
| ⬜ | `POST /orders/:id/cancel` | 👤 | Solo `PENDING_PAYMENT`; libera la reserva. |
| ✅ | `POST /orders/:id/payment/upload-url` | 👤 | Valida tipo/tamaño y devuelve URL firmada de R2 (`{uploadUrl, proofKey}`). 400 tipo o tamaño inválido; 404 pedido ajeno; 409 si no está `PENDING_PAYMENT` (D70). |
| ✅ | `GET /payment-methods?currency=` | — | Público. Métodos de pago activos, filtrados por moneda si se indica (RF-COM-03, D63). |
| ✅ | `POST /orders/:id/payment` | 👤 | Body `{paymentMethodId, proofKey, proofHash, operationNumber, acceptsLegalDeclaration}` → pedido `IN_REVIEW`, pago `PENDING`. `proofHash` lo calcula el cliente (D71). Solo desde `PENDING_PAYMENT` y con reserva vigente (409 si no). El método debe estar activo y aceptar `orders.currency` (D63, trigger `trg_payment_method_currency`, 409). 409 si `(paymentMethodId, operationNumber)` o `proofHash` ya existen (D21, D64). 400 si `proofKey` no corresponde al pedido o no se acepta la declaración legal (RF-COM-13/D43/D72). 404 pedido ajeno. |
| ✅ | `POST /orders/:id/license/reveal` | 👤 | Devuelve la(s) clave(s) en claro de las licencias `SOLD` del pedido **y registra auditoría** (`license.revealed`, nunca la clave). Solo `DELIVERED` (409 si no). Límite: 20/min por IP (D73). |
| ⬜ | `POST /claims` | 👤 | Body `{orderId, reason}`. 409 si ya hay uno abierto, fuera de ventana (7 días, D25) o ya usó su reposición (D26). |
| ⬜ | `GET /claims` | 👤 | Mis reclamos. |
| ⬜ | `POST /support-tickets` | 👤 | Body `{subject, body}` → crea ticket `OPEN` (D34). |
| ⬜ | `GET /support-tickets` | 👤 | Mis tickets. |
| ⬜ | `POST /support-tickets/:id/messages` | 👤 | Body `{body}`. 409 si el ticket está `CLOSED`. |
| ⬜ | `POST /reviews` | 👤 | Body `{orderId, productId, rating, body}`. 403 si el pedido no es `DELIVERED` del cliente. Crea en `PENDING` (D33). |

## Administración (Sprint 3, todo 🛡️)
| | Ruta | Notas |
|---|---|---|
| ⬜ | `GET /admin/summary` | Contadores: pagos pendientes (+ espera máxima), reclamos abiertos, planes con stock bajo/agotados; ventas, entregas y margen del día. |
| ✅ | `GET /admin/payments?status=PENDING` | Cola ordenada por antigüedad (`createdAt` asc), con URL firmada de lectura del comprobante, monto, moneda, reserva restante e ítems. |
| ✅ | `POST /admin/payments/:id/approve` | Transacción (`fn_approve_payment`): licencia → SOLD, pedido → DELIVERED, pago → APPROVED, auditoría, encola `license-delivered:{orderId}`. Idempotente. 404 si no existe; 409 si el pago ya fue revisado. |
| ✅ | `POST /admin/payments/:id/reject` | Body `{reason}` (enum `AMOUNT_MISMATCH`\|`ILLEGIBLE_PROOF`\|`OPERATION_NOT_FOUND`, RF-ADM-13). Transacción (`fn_reject_payment`): pedido vuelve a `PENDING_PAYMENT` con plazo extra (reintento 1–2) o `CANCELLED` al 3.er rechazo (D18), libera la licencia reservada si cancela. Encola `payment-rejected`. 404 si no existe; 409 si el pago ya fue revisado. |
| ✅ | `GET /admin/payment-methods` | Todos los métodos, incluidos inactivos (D65). |
| ✅ | `POST /admin/payment-methods` | Crea un método; auditado (D65). `CRYPTO` solo admite `['USD']`. |
| ✅ | `PATCH /admin/payment-methods/:id` | Edita cualquier campo, incluida la desactivación (`active: false`); auditado (D65). 404 si no existe. |
| ✅ | `GET /admin/categories` | Lista todas las categorías. |
| ✅ | `POST /admin/categories` | Crea una categoría; auditado. |
| ✅ | `PATCH /admin/categories/:id` | Edita el nombre; auditado. 404 si no existe. |
| ✅ | `DELETE /admin/categories/:id` | Borra la categoría (productos quedan sin categoría); auditado. 404 si no existe. |
| ✅ | `GET /admin/products` | Lista todos los productos, incluidos inactivos. |
| ✅ | `POST /admin/products` | Crea un producto (incl. `requiresToolUsername`); auditado. |
| ✅ | `PATCH /admin/products/:id` | Edita cualquier campo, incluida la desactivación (`active: false`); auditado. 404 si no existe. |
| ✅ | `POST /admin/plans` | Crea un plan con sus precios por moneda (D61); auditado. 400 sin precios. |
| ✅ | `PATCH /admin/plans/:id` | Edita campos y/o hace upsert de precios por moneda (no borra monedas omitidas); auditado. 404 si no existe. |
| ⬜ | `POST /admin/orders/:id/activate` | Marca `PENDING_ACTIVATION → DELIVERED` tras aplicar la licencia sobre la cuenta del cliente (D14). Auditoría. |
| ⬜ | `GET /admin/inventory?filter=low\|out` | Por plan: disponibles, reservadas, vendidas, estado, umbral. |
| ⬜ | `POST /admin/inventory/batches/preview` | Body `{planId, secrets[]}` o CSV → `{valid, duplicates, errors}` sin guardar. |
| ⬜ | `POST /admin/inventory/batches` | Body `{planId, supplier?, unitCostCents, secrets[], notes?}`. Crea lote + licencias cifradas. Auditoría. |
| ⬜ | `PATCH /admin/licenses/:id/void` | Body `{reason}`. Solo `AVAILABLE`. |
| ⬜ | `GET /admin/claims?status=OPEN` | Cola con motivo, pedido y stock para reponer. |
| ⬜ | `POST /admin/claims/:id/replace` | Transacción: original → VOID, nueva (SKIP LOCKED) → SOLD, reclamo → RESOLVED, notificación. 409 sin stock. |
| ⬜ | `POST /admin/claims/:id/reject` | Body `{reason}`. |
| ⬜ | `GET/POST/PATCH /admin/products`, `/admin/plans`, `/admin/categories` | CRUD completo, **Sprint 2** (D38, adelantado). |
| ⬜ | `GET/PUT /admin/settings` | TTL, horario, datos de pago, SLA (24h), monto máx. cliente nuevo (D19, D22). |
| ⬜ | `GET /admin/support-tickets?status=OPEN` | Cola de tickets. |
| ⬜ | `POST /admin/support-tickets/:id/messages` | Responde; body `{body}`. |
| ⬜ | `POST /admin/support-tickets/:id/close` | Cierra el ticket. |
| ⬜ | `GET /admin/reviews?status=PENDING` | Cola de moderación. |
| ⬜ | `POST /admin/reviews/:id/approve` \| `/reject` | Modera una reseña. |
| ⬜ | `GET /admin/reports/sales?from=&to=&group=day\|week` | Ventas (soles) y n.º de pedidos por día o semana (D55). |
| ⬜ | `GET /admin/reports/margin?from=&to=` | Margen por producto/plan: `unitPriceCents − unitCostCents` agregado (D55). |
| ⬜ | `GET /admin/reports/stock-value` | Valor total del inventario `AVAILABLE` (Σ `unitCostCents`) (D55). |
| ⬜ | `GET /admin/reports/top-plans?from=&to=&limit=` | Ranking de planes más vendidos en el rango (D55). |
| ⬜ | `GET /admin/queues` | Bull Board montado (Sprint 4). |

## Reglas transversales
- Toda mutación crítica escribe `audit_logs`.
- Las respuestas de listados **nunca** incluyen claves; solo `reveal`/admin las descifran, bajo demanda.
- Listados paginados: `?page=1&pageSize=20` (máx. 50) → `{items, total, page, pageSize}`.
- Rate limiting en login, registro, `reveal` y subida de comprobantes.
- DTOs con `class-validator`; campos desconocidos → 400.
