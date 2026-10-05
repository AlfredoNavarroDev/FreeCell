# 06 · API REST

Base: `http://localhost:3000`. JSON. Autenticación: `Authorization: Bearer <JWT>`.
Errores: formato estándar de Nest `{ "statusCode", "message", "error" }`. `message` es texto en español apto para mostrar.
Códigos usados: 400 validación · 401 sin sesión · 403 rol insuficiente · 404 no existe · 409 conflicto de negocio (sin stock, duplicado) · 429 límite de uso.

**Leyenda de acceso:** 🌐 público · 👤 cliente autenticado (solo sus recursos) · 🛡️ ADMIN.
**Estado:** ✅ implementado · ⬜ pendiente.

## Implementados (Sprint 1)
| | Método y ruta | Acceso | Descripción |
|---|---|---|---|
| ✅ | `GET /health` | 🌐 | `{status:'ok'}` |
| ✅ | `POST /auth/register` | 🌐 | Body `{email, password, name?}` → `{accessToken, user}`. 409 si el correo existe. |
| ✅ | `POST /auth/login` | 🌐 | Body `{email, password}` → `{accessToken, user}`. 401 genérico. |
| ✅ | `GET /auth/me` | 👤 | Perfil sin datos sensibles. |
| ✅ | `POST /orders` | 👤 | Body `{planId, toolUsername?}` → `{id, status, totalCents, expiresAt}`. 404 plan inactivo; **409 agotado**. |

## Catálogo (Sprint 2)
| | Ruta | Acceso | Notas |
|---|---|---|---|
| ⬜ | `GET /catalog/products?query=&category=&page=` | 🌐 | Productos activos con `priceFromCents`, categoría y `stockState` agregado. Paginado. |
| ⬜ | `GET /catalog/products/:slug` | 🌐 | Ficha con planes: `{id, name, kind, durationDays, priceCents, stockState, available?}`. **[?]** exponer `available` exacto. |
| ⬜ | `GET /catalog/categories` | 🌐 | |

## Pedidos y pagos del cliente (Sprint 2)
| | Ruta | Acceso | Notas |
|---|---|---|---|
| ⬜ | `GET /orders?status=` | 👤 | Mis pedidos, paginado. |
| ⬜ | `GET /orders/:id` | 👤 | Detalle + línea de seguimiento + estado del pago. 404 si no es suyo. |
| ⬜ | `POST /orders/:id/cancel` | 👤 | Solo `PENDING_PAYMENT`; libera la reserva. |
| ⬜ | `POST /orders/:id/payment/upload-url` | 👤 | Valida tipo/tamaño y devuelve URL firmada de R2 (`{uploadUrl, proofKey}`). |
| ⬜ | `POST /orders/:id/payment` | 👤 | Body `{method, proofKey}` → pedido `IN_REVIEW`, pago `PENDING`. Solo desde `PENDING_PAYMENT` y con reserva vigente. |
| ⬜ | `POST /orders/:id/license/reveal` | 👤 | Devuelve la clave en claro **y registra auditoría**. Solo `DELIVERED`. Con límite de uso. |
| ⬜ | `POST /claims` | 👤 | Body `{orderId, reason}`. 409 si ya hay uno abierto o fuera de ventana. |
| ⬜ | `GET /claims` | 👤 | Mis reclamos. |

## Administración (Sprint 3, todo 🛡️)
| | Ruta | Notas |
|---|---|---|
| ⬜ | `GET /admin/summary` | Contadores: pagos pendientes (+ espera máxima), reclamos abiertos, planes con stock bajo/agotados; ventas, entregas y margen del día. |
| ⬜ | `GET /admin/payments?status=PENDING` | Cola ordenada por antigüedad, con URL firmada del comprobante. |
| ⬜ | `POST /admin/payments/:id/approve` | Transacción: licencia → SOLD, pedido → DELIVERED, pago → APPROVED, auditoría, encola `license-delivered:{orderId}`. Idempotente. |
| ⬜ | `POST /admin/payments/:id/reject` | Body `{reason}` (enum). Encola `payment-rejected`. Efecto sobre el pedido **[?]**. |
| ⬜ | `GET /admin/inventory?filter=low\|out` | Por plan: disponibles, reservadas, vendidas, estado, umbral. |
| ⬜ | `POST /admin/inventory/batches/preview` | Body `{planId, secrets[]}` o CSV → `{valid, duplicates, errors}` sin guardar. |
| ⬜ | `POST /admin/inventory/batches` | Body `{planId, supplier?, unitCostCents, secrets[], notes?}`. Crea lote + licencias cifradas. Auditoría. |
| ⬜ | `PATCH /admin/licenses/:id/void` | Body `{reason}`. Solo `AVAILABLE`. |
| ⬜ | `GET /admin/claims?status=OPEN` | Cola con motivo, pedido y stock para reponer. |
| ⬜ | `POST /admin/claims/:id/replace` | Transacción: original → VOID, nueva (SKIP LOCKED) → SOLD, reclamo → RESOLVED, notificación. 409 sin stock. |
| ⬜ | `POST /admin/claims/:id/reject` | Body `{reason}`. |
| ⬜ | `GET/POST/PATCH /admin/products`, `/admin/plans`, `/admin/categories` | CRUD (Should). |
| ⬜ | `GET/PUT /admin/settings` | TTL, horario, datos de pago (Should). |
| ⬜ | `GET /admin/queues` | Bull Board montado (Sprint 4). |

## Reglas transversales
- Toda mutación crítica escribe `audit_logs`.
- Las respuestas de listados **nunca** incluyen claves; solo `reveal`/admin las descifran, bajo demanda.
- Listados paginados: `?page=1&pageSize=20` (máx. 50) → `{items, total, page, pageSize}`.
- Rate limiting en login, registro, `reveal` y subida de comprobantes.
- DTOs con `class-validator`; campos desconocidos → 400.
