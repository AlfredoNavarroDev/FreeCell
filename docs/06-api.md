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
| ⬜ | `POST /auth/google` | 🌐 | Body `{idToken}` (token de Google verificado por NextAuth) → find-or-create por correo, `emailVerifiedAt` automático, `role=CUSTOMER` si es nuevo → `{accessToken, user}` (D53, D54, RF-AUT-10). |
| ✅ | `POST /orders` | 👤 | Body `{currency, items:[{planId, qty}], toolUsername?}` → `201 {id, orderNumber, status, totalCents, currency, expiresAt, cancelReason, items}`. Reserva todos los ítems del carrito en una transacción (D30); 404 plan inactivo; 409 sin stock de un ítem (rechaza el carrito completo) o plan sin precio en la moneda elegida; 400 moneda inválida o falta `toolUsername` requerido. |
| ✅ | `GET /orders/:id` | 👤 | Mismo shape que la creación. 404 si no es del usuario. |
| ✅ | `POST /orders/:id/cancel` | 👤 | Solo desde `PENDING_PAYMENT`; libera la reserva. 409 si no está en ese estado; 200 idempotente si ya estaba `CANCELLED`. |

## Catálogo (Sprint 2)
| | Ruta | Acceso | Notas |
|---|---|---|---|
| ⬜ | `GET /catalog/products?query=&category=&page=` | 🌐 | Productos activos con `priceFromCents`, categoría y `stockState` agregado. Paginado. |
| ⬜ | `GET /catalog/products/:slug` | 🌐 | Ficha con planes: `{id, name, kind, durationDays, priceCents, currency, stockState}`. Nunca expone cantidad exacta disponible (D29). |
| ⬜ | `GET /catalog/categories` | 🌐 | |

## Pedidos y pagos del cliente (Sprint 2)
| | Ruta | Acceso | Notas |
|---|---|---|---|
| ⬜ | `GET /orders?status=` | 👤 | Mis pedidos, paginado. |
| ⬜ | `GET /orders/:id` | 👤 | Detalle + línea de seguimiento + estado del pago. 404 si no es suyo. |
| ⬜ | `POST /orders/:id/cancel` | 👤 | Solo `PENDING_PAYMENT`; libera la reserva. |
| ✅ | `POST /orders/:id/payment/upload-url` | 👤 | Valida tipo/tamaño y devuelve URL firmada de R2 (`{uploadUrl, proofKey}`). 400 tipo o tamaño inválido; 404 pedido ajeno; 409 si no está `PENDING_PAYMENT` (D70). |
| ⬜ | `POST /orders/:id/payment` | 👤 | Body `{paymentMethodId, proofKey, operationNumber}` → pedido `IN_REVIEW`, pago `PENDING`. Solo desde `PENDING_PAYMENT` y con reserva vigente. El método debe estar activo y aceptar `orders.currency` (D63, trigger `trg_payment_method_currency`). 409 si `(paymentMethodId, operationNumber)` o el hash del archivo ya existen (D21, D64). |
| ⬜ | `POST /orders/:id/license/reveal` | 👤 | Devuelve la clave en claro **y registra auditoría**. Solo `DELIVERED`. Con límite de uso. |
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
| ⬜ | `GET /admin/payments?status=PENDING` | Cola ordenada por antigüedad, con URL firmada del comprobante. |
| ⬜ | `POST /admin/payments/:id/approve` | Transacción: licencia → SOLD, pedido → DELIVERED, pago → APPROVED, auditoría, encola `license-delivered:{orderId}`. Idempotente. |
| ⬜ | `POST /admin/payments/:id/reject` | Body `{reason}` (enum). Pedido vuelve a `PENDING_PAYMENT` (reintento 1–2) o `CANCELLED` al 3.er rechazo (D18). Encola `payment-rejected`. |
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
