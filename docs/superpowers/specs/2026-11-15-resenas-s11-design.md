# Reseñas de producto (S2/S1 público, S4 cliente, S11 admin) — diseño

**Fecha**: 2026-11-15
**Paso del roadmap**: #9 en `docs/10-orden-de-ejecucion.md`
**Decisiones relacionadas**: D33 (solo compradores con pedido `DELIVERED` de ese producto, moderadas por admin antes
de publicarse), D57 (lógica crítica en Postgres cuando hay estado o reglas de integridad).
**Requisitos**: RF-CAT-10, RF-ADM-45.

## Contexto

La entidad `Review`, el enum `ReviewStatus` (`PENDING`/`APPROVED`/`HIDDEN`) y la tabla `reviews` existen desde
Fundaciones: única por `(orderId, productId)`, `rating` 1–5 (CHECK) e índice por `status`. No hay módulo NestJS ni
pantallas. Se copia la estructura de reclamos (S8) y soporte (S9/S11): módulo propio en `src/reviews/`, clientes y
pantallas en el frontend, y la pestaña «Reseñas» que `docs/07` ya reserva dentro de S11 (`/admin/soporte`).

### Decisiones tomadas en esta sesión

1. **Dónde se muestran** (acordado con el usuario): pestaña «Reseñas» en `/p/[slug]` con lista y promedio, y estrellas
   más conteo en la tarjeta del catálogo (`ProductCard`). **Fuera**: sección de reseñas en la portada.
2. **Dónde se escribe** (acordado): solo desde `/pedidos`, en el detalle de un pedido `DELIVERED`, un botón «Valorar»
   por producto. No hay formulario en la ficha del producto.
3. **Autor público** (acordado): «Nombre + inicial» (ej. «Carlos M.») a partir de `users.name`; si es nulo o vacío,
   «Cliente verificado». Todas las reseñas publicadas llevan la marca «Compra verificada». El apellido completo y el
   correo nunca salen en la API pública.
4. **Moderación**: el admin puede aprobar una reseña `PENDING`, ocultar una `PENDING` o `APPROVED`, y reaprobar una
   `HIDDEN`. Pedir el mismo estado en el que ya está → 409. No se pide motivo al ocultar. El cliente **no edita ni
   borra** su reseña una vez enviada.
5. **Promedio**: vista `v_product_ratings` (patrón de `v_plan_stock`), no columnas desnormalizadas en `products`. No
   puede quedar desincronizada y el volumen no justifica un trigger de mantenimiento.
6. **Regla en Postgres**: un trigger `BEFORE INSERT` en `reviews` exige que `orderId` sea un pedido `DELIVERED` del
   mismo `userId` y que contenga un ítem de un plan de `productId` (D33, D57). El service valida lo mismo para dar
   respuestas 404/403 claras; el trigger es la red de seguridad si algo salta el service.
7. **Sin función SQL de moderación**: el cambio de estado es un `SELECT ... FOR UPDATE` seguido de un `UPDATE`, dentro
   de una transacción con la fila de auditoría (404 si no existe, 409 si ya tiene ese estado). No hay stock ni dinero
   en juego, así que una función plpgsql no aporta nada (a diferencia de `fn_resolve_claim`).
8. **Validación**: `rating` entero 1–5; `body` 10–1000 caracteres tras `trim` (la columna es `text`, el tope lo pone el
   DTO). El cuerpo se muestra siempre como texto plano (React escapa; no se interpreta HTML).
9. **Auditoría**: `review.created`, `review.approved`, `review.hidden`. Las dos últimas guardan el estado previo.
10. **Propiedad**: un pedido ajeno responde 404 (no 403) para no filtrar su existencia; un pedido propio no
    `DELIVERED` o sin ese producto responde 403 (D33: «no es compra verificada»).

## Base de datos (migración `ReviewFunctions`)

- Vista `v_product_ratings(productId, ratingAvg numeric(3,2), ratingCount int)`: `GROUP BY productId` sobre reseñas
  `APPROVED`. Los productos sin reseñas aprobadas no aparecen (se unen con `LEFT JOIN`).
- Índice parcial `reviews("productId", "createdAt") WHERE status = 'APPROVED'` para la lista pública (ascendente:
  TypeORM no declara orden `DESC` en índices y Postgres lo recorre al revés; así no hay deriva con la entidad).
- Trigger `trg_review_requires_delivered` (`BEFORE INSERT ON reviews`) como en la decisión 6; mensaje de error en
  español, `ERRCODE` `P0001`.
- `down()` simétrico (borra trigger, función, índice y vista).

## API

### Cliente — `ReviewsController` (prefix `/reviews`)

| Método | Ruta | Body | Notas |
|---|---|---|---|
| `POST` | `/reviews` | `{orderId, productId, rating, body}` | Crea en `PENDING`. 404 si el pedido no es mío; 403 si no es `DELIVERED` o no contiene ese producto; 409 si ya reseñé ese producto en ese pedido. Audita `review.created`. 201. |
| `GET` | `/reviews?page&pageSize` | — | Mis reseñas: `{id, orderId, productId, productName, rating, body, status, createdAt}[]` paginado, más reciente primero. `/pedidos` lo usa para saber qué productos ya valoró y su estado. |

### Pedidos — cambio menor

`GET /orders` y `GET /orders/:id` agregan `productId` a cada `items[]` (junto a `orderItemId`): `/pedidos` lo necesita
para enviar `POST /reviews` y para saber qué productos ya valoró el cliente.

### Público — `CatalogController` (ya existente)

| Método | Ruta | Notas |
|---|---|---|
| `GET` | `/catalog/products/:slug/reviews?page&pageSize` | Solo `APPROVED`: `{items:[{id, rating, body, authorName, createdAt}], total, page, pageSize, ratingAvg, ratingCount}`. 404 si el producto no existe o está inactivo. Sin autenticación. |
| `GET` | `/catalog/products` y `/catalog/products/:slug` | Se agregan `ratingAvg` (`number \| null`) y `ratingCount` (`number`, 0 si no hay) vía `LEFT JOIN v_product_ratings`. |

### Admin — `AdminReviewsController` (prefix `/admin/reviews`, `@Roles(Role.ADMIN)`)

| Método | Ruta | Notas |
|---|---|---|
| `GET` | `/admin/reviews?status=&page&pageSize` | Cola: `{reviewId, status, rating, body, productName, orderNumber, customerName, customerEmail, createdAt}[]`, más antigua primero. El frontend pide `PENDING`. |
| `POST` | `/admin/reviews/:id/approve` | `PENDING`/`HIDDEN` → `APPROVED`. 404 / 409 si ya está `APPROVED`. Audita `review.approved`. Devuelve `{reviewId, status}`. |
| `POST` | `/admin/reviews/:id/hide` | `PENDING`/`APPROVED` → `HIDDEN`. 404 / 409 si ya está `HIDDEN`. Audita `review.hidden`. Devuelve `{reviewId, status}`. |

## Frontend

- `lib/reviews-client.ts` (Server Actions, cliente): `createReview(orderId, productId, rating, body)`, `listMyReviews()`.
- `lib/reviews-public-client.ts` (Server Action, sin sesión): `fetchProductReviews(slug, page)`; la ficha carga la primera
  página en el servidor y «Cargar más» la invoca desde el cliente.
- `lib/reviews-admin-client.ts`: `fetchAdminReviews(status)`, `approveReview(id)`, `hideReview(id)`.
- `/pedidos` (S4): bajo la clave entregada, bloque «Valora tu compra» con una fila por producto del pedido: «Valorar»
  abre estrellas (botones nativos, `aria-pressed`) y textarea; tras enviar muestra «Tu reseña está en revisión». Si
  ya existe, muestra su estado (en revisión / publicada / oculta) sin botón. Un `key` por pedido evita arrastrar el
  borrador entre pedidos (lección de `ClaimSection`).
- `/p/[slug]` (S2): `ProductTabs` suma la pestaña «Reseñas» con promedio, conteo y lista paginada («Cargar más»).
  Sin reseñas: «Todavía no hay reseñas.»
- `ProductCard` (S1): estrellas y conteo cuando `ratingCount > 0`; si no, no muestra nada (nunca «0 reseñas»).
- `/admin/soporte` (S11): pasa a dos pestañas, «Tickets» y «Reseñas». La pestaña de reseñas reutiliza el patrón de cola
  y detalle: texto, estrellas, producto, pedido, cliente; botones «Aprobar» y «Ocultar». Tras actuar se refetch y se
  avanza a la siguiente. Cola vacía: «Sin reseñas pendientes.» El sidebar muestra en «Soporte» la suma de tickets
  abiertos y reseñas pendientes.
- Accesibilidad AA: elementos nativos, objetivos ≥ 44 px, el estado y la puntuación nunca solo por color o ícono
  (texto «4 de 5» junto a las estrellas).

## Testing

- **E2E backend** (Postgres/Redis reales, `--runInBand`, `TEST_DATABASE_URL` en 5433 en esta máquina):
  - `reviews.e2e-spec.ts`: crea `PENDING` (201 + audit); 404 pedido ajeno; 403 pedido no entregado; 403 producto que
    no está en el pedido; 409 duplicado; 400 `rating` 0 y 6, cuerpo corto; el trigger rechaza un `INSERT` directo
    por SQL que salta el service; `GET /reviews` solo devuelve las mías.
  - `catalog-reviews.e2e-spec.ts`: la lista pública solo trae `APPROVED`; `authorName` como «Nombre I.» y «Cliente
    verificado» sin nombre; `ratingAvg`/`ratingCount` en lista y ficha; productos sin reseñas con `null` y `0`; 404
    en producto inexistente; una `HIDDEN` no entra al promedio.
  - `admin-reviews.e2e-spec.ts`: cola con filtro; aprobar; ocultar; reaprobar una `HIDDEN`; 409 al repetir estado;
    404; 403 si no es admin; la reseña recién aprobada aparece en el endpoint público.
- **Vitest** de los tres clientes (mismo estilo que `claims-client.test.ts`).
- **Verificación manual en navegador**: cliente valora → admin aprueba en `/admin/soporte` → la reseña y el promedio
  aparecen en la ficha y la tarjeta; ocultar la quita; el cliente ve el estado en `/pedidos`.

## Fuera de alcance

Reseñas en la portada, edición o borrado por el cliente, respuesta del negocio, ordenar/filtrar reseñas por
puntuación, avisos por correo o WhatsApp al cliente (RF-NOT), reseñas sin pedido.

## Documentación a actualizar al cerrar

`docs/02` (RF-CAT-10, RF-ADM-45 ⬜→✅), `docs/06` (`POST/GET /reviews`, `GET /catalog/products/:slug/reviews`,
`GET /admin/reviews`, `approve`/`hide`; nota de `ratingAvg`/`ratingCount` en el catálogo; el doc dice `/reject`, queda
`/hide`), `docs/05` (vista y trigger), `docs/07` (S11 sin «Parcial»), `docs/09` (decisiones D76+ para las del
punto «Decisiones tomadas»), `docs/10` (paso 9 ✅, próximo paso 10), `CLAUDE.md` raíz si cambia el estado.
