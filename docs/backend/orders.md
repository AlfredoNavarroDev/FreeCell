# Orders

**Archivos:** `src/orders/orders.controller.ts`, `src/orders/orders.service.ts`, `src/orders/dto/*.ts`,
`src/orders/orders-queue.service.ts`, `src/orders/orders.constants.ts`. Pruebas: `test/orders.e2e-spec.ts`,
`test/concurrency.e2e-spec.ts`.

## Endpoints

| Método y ruta | Acceso | Body | Respuesta | Errores |
|---|---|---|---|---|
| `POST /orders` | 👤 | `{currency, items:[{planId, qty}], toolUsername?}` | `201 OrderResponseDto` | ver tabla de abajo |
| `GET /orders/:id` | 👤 | — | `200 OrderResponseDto` | `404 "Pedido no encontrado"` si no existe o no es del usuario |
| `POST /orders/:id/cancel` | 👤 | — | `200 OrderResponseDto` | `409 "Solo puedes cancelar un pedido pendiente de pago"`; `404` si no es del usuario |

`OrderResponseDto` (`src/orders/dto/order-response.dto.ts`):
```json
{
  "id": "uuid", "orderNumber": 1001, "status": "PENDING_PAYMENT",
  "totalCents": 1000, "currency": "PEN", "expiresAt": "2026-...",
  "cancelReason": null,
  "items": [{ "planId": "uuid", "unitPriceCents": 1000 }]
}
```
`items` va ordenado por `planId` en la respuesta.

### `CreateOrderDto` (`POST /orders`)
| Campo | Regla |
|---|---|
| `currency` | debe estar en `CURRENCIES` (`'PEN' \| 'USD'`) → `400 "La moneda debe ser PEN o USD"` |
| `items` | lista de `{planId: uuid, qty: int 1–5}`, 1 a 10 elementos, sin `planId` repetido |
| `toolUsername?` | opcional, 1–120 caracteres |

## Algoritmo de reserva (`OrdersService.create`)

Todo corre dentro de una **única transacción** (`DataSource.transaction`):

1. Ordena los ítems del carrito por `planId` (`localeCompare`) — fija el orden en que cada transacción toma los
   `FOR UPDATE SKIP LOCKED`, para que carritos cruzados (A pide planes X,Y; B pide Y,X) no se bloqueen entre sí
   (sin deadlocks).
2. Carga todos los planes pedidos en una sola consulta (`JOIN products`, `LEFT JOIN plan_prices` filtrando por la
   `currency` del pedido). Por cada ítem:
   - Si el plan no existe, o el plan o su producto están inactivos → `404 "Uno de los planes no existe o no está disponible"`.
   - Si no hay fila en `plan_prices` para esa moneda (`priceCents IS NULL`) → `409 "{nombre del plan} no está disponible en {moneda}"`.
   - Si el producto exige `toolUsername` y no llegó → `400 "{nombre del plan} requiere tu usuario de la herramienta"`.
3. Por cada ítem, en el orden fijado en el paso 1:
   ```sql
   SELECT id FROM license_items
    WHERE "planId" = $1 AND status = 'AVAILABLE'
    ORDER BY "createdAt"
    LIMIT $2
    FOR UPDATE SKIP LOCKED
   ```
   Si vuelven menos filas que `qty` → `409 "Sin stock suficiente de {nombre del plan}"` y la transacción hace
   rollback completo: **no queda nada reservado**, ni de ese plan ni de los anteriores del mismo carrito.
4. Lee el TTL de reserva de `settings.reservationTtlMinutes` (`SettingsService.getNumber`, default 30 si falta o no
   es numérico). Calcula `expiresAt = now() + ttl`.
5. Inserta el `order` (`status = PENDING_PAYMENT`, `totalCents` = suma de `priceCents × qty`, `currency` del
   pedido, `toolUsername` si llegó) y, por cada unidad reservada, un `order_item` con
   `unitPriceCents = plan_prices.priceCents` de la moneda elegida (precio **congelado** en el momento de la
   compra: un cambio posterior en `plan_prices` no afecta pedidos ya creados). Pasa cada `license_item` tomado a
   `RESERVED` con `orderItemId` y `reservedUntil = expiresAt`.
6. Audita `order.created` (`meta: {items, totalCents, currency}`).
7. **Después del commit** (fuera de la transacción, en `afterCreate`): encola el job de liberación
   (`jobId = release-{orderId}`, con retraso `ttl + 2s` de margen) y la notificación `order-created-{orderId}`. Si
   Redis falla aquí, solo se registra una advertencia (`logger.warn`) y la API responde `201` igual — el barrido
   `sweep-expired` (ver `queues.md`) libera el pedido aunque el job se haya perdido.

## Cancelación (`POST /orders/:id/cancel`)

- Carga el pedido del usuario (404 si no es suyo). Si ya está `CANCELLED`, responde `200` **sin tocar nada**
  (idempotente).
- En otro caso, llama `SELECT fn_release_order($1, 'CUSTOMER_CANCELLED', false)` (ver `database.md`). Si la función
  devuelve `true` (el pedido seguía `PENDING_PAYMENT`), audita `order.cancelled`.
- Si la función devolvió `false` y el pedido sigue sin `CANCELLED` tras recargarlo (p. ej. estaba `IN_REVIEW`) →
  `409 "Solo puedes cancelar un pedido pendiente de pago"`.

## Monedas y precio congelado

- `orders.currency` la elige el cliente en el body, sin default; debe ser `PEN` o `USD` (D61).
- Todas las líneas (`order_items`) del mismo pedido se cobran en esa única moneda — no hay columna `currency` en
  `order_items`, hereda la del pedido.
- El precio de cada línea es el de `plan_prices` para `(planId, currency)` **en el momento de crear el pedido**; se
  copia a `order_items.unitPriceCents` y ya no cambia aunque el precio del plan cambie después.
- Un plan sin fila en `plan_prices` para la moneda pedida no se puede comprar en esa moneda (409, ver arriba).

## Propiedad del recurso

`findOwned` (privado) filtra siempre por `{id: orderId, userId}`; un pedido ajeno o inexistente responde el mismo
`404 "Pedido no encontrado"` (invariante 7, evita filtrar si el id existe).
