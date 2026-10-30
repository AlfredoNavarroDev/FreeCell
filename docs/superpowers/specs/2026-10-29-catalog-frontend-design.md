# Catálogo del frontend conectado a la API real — diseño

**Fecha**: 2026-10-29
**Sprint**: 2 (frontend)
**Paso del roadmap**: #2 en `docs/10-orden-de-ejecucion.md`
**Decisiones relacionadas**: D25 (reposición 7 días, máx. 1), D29 (nunca exponer stock exacto), D61 (precio por
plan y moneda, sin conversión), D63 (métodos de pago configurables por moneda), D66 (listado usa `currency=PEN`
por defecto), D67 (`category` es id, no nombre), D69 (`stockState` agregado = mejor estado entre los planes).

## Contexto

El backend del catálogo (Sprint 2) está completo y probado: `GET /catalog/products`, `GET /catalog/products/:slug`,
`GET /catalog/categories`, `GET /payment-methods` — todos públicos, sin auth (`backend/src/catalog/`,
`backend/src/payment-methods/`). El frontend (`frontend/`) todavía no los usa: la pantalla S1 (`app/page.tsx`,
`catalog-grid.tsx`, `product-card.tsx`) renderiza datos de ejemplo hardcodeados en `src/lib/mock-catalog.ts`
(`"use client"`, filtra en memoria, sin paginación ni fetch).

Este spec cubre **solo** la pantalla S1 (catálogo: `/`). No incluye `/p/[slug]` (S2) ni carrito/checkout (S3) —
esos son el paso 3 del roadmap; la card de producto del listado deliberadamente no linkea a `/p/[slug]` todavía
porque esa ruta no existe.

### Dirección visual

Se adoptó como sistema de diseño real el explorado con el usuario (mockup "Variante B: Bento Asimétrico & Glass"
generado con Stitch, aprobado por el usuario) — reemplaza/concreta los tokens genéricos de `docs/07-diseno-ui.md`
con valores exactos. Paleta y tipografía ya coinciden con `docs/07` (violeta como variable de acento editable,
Space Grotesk + IBM Plex Sans); lo nuevo es la dirección bento + glassmorphism puntual.

**Regla de contenido (ya corregida una vez con el usuario, no repetir el error):** nunca mostrar números en vivo
inventados (ej. "98 licencias ahora", "7 min promedio", "99.4% efectividad", conteos de técnicos/ratings). Todo
número visible debe ser real (viene de la API) o una afirmación de política ya decidida en `docs/09` (7 días de
reposición, 30 min de reserva) — nunca una métrica medida que no existe.

## Tokens (Tailwind v4, `@theme`)

| Token | Valor | Uso |
|---|---|---|
| `--color-ink` | `#0F172A` | Texto principal |
| `--color-muted` | `#64748B` | Texto secundario/metadata |
| `--color-ground` | `#F8FAFC` | Fondo de página |
| `--color-surface` | `#FFFFFF` | Tarjetas |
| `--color-line` | `#E2E8F0` | Bordes |
| `--color-accent` | `#6D28D9` | Botón primario, selección |
| `--color-accent-hover` | `#7C3AED` | Hover |
| `--color-accent-press` | `#5B21B6` | Active/pressed |
| `--color-accent-soft` | `#F5F3FF` | Fondos de énfasis |
| `--color-accent-border` | `#DDD6FE` | Borde de énfasis |
| `--color-success` / `--color-success-bg` | `#067647` / `#DCFAE6` | En stock, aprobado |
| `--color-warning` / `--color-warning-bg` | `#93370D` / `#FEF0C7` | Pocas unidades |
| `--color-danger` / `--color-danger-bg` | `#B42318` / `#FEE4E2` | Agotado |

Tipografía: Space Grotesk 600/700 (títulos, precios, `tabular-nums`), IBM Plex Sans 400/500/600 (resto).
Radios: 8px controles/badges chicos, 16px tarjetas, 24px hero, `9999px` chips/pills.
Glassmorphism: solo en el header sticky y en la tarjeta de confianza del hero — en ningún otro lado.

## Backend: `sort` en `GET /catalog/products`

Única pieza de backend de este spec. `CatalogQueryDto` suma:

```ts
sort?: 'price_asc' | 'price_desc' | 'newest'; // IsIn, opcional, default = orden actual (por nombre)
```

`CatalogService.listProducts` arma el `ORDER BY` desde un mapa fijo de opciones válidas (nunca interpola el
valor crudo del cliente en SQL) y, para `newest`, agrega `pr."createdAt"` al `SELECT` (la columna ya existe en
`products`, no hace falta migración). Sin opción "más populares" — no hay datos de ventas agregados todavía
(eso es el paso 10 del roadmap, reportes).

Actualiza `docs/06-api.md` (fila de `GET /catalog/products`) y agrega un caso a
`backend/test/catalog.e2e-spec.ts`.

## Frontend: arquitectura

### Fetch layer (nuevo) — `frontend/src/lib/catalog-client.ts`

Server-side only (`process.env.API_URL`, sin `NEXT_PUBLIC_`), `fetch` con `next: { revalidate: 60 }`:

- `fetchCatalogProducts({ query?, category?, sort?, pageSize })` → `ProductListItem[]` + `total`.
- `fetchCatalogCategories()` → `Category[]`.
- `fetchPaymentMethods()` → `PaymentMethod[]` (para el widget del hero; reusa `GET /payment-methods` ya existente).

Tipos calcados de los DTOs del backend. Reemplaza los tipos de `mock-catalog.ts`.

### Componentes

| Archivo | Cambio |
|---|---|
| `stock-badge.tsx` | `StockState`/`STOCK_LABEL` pasan a los valores reales del backend (`IN_STOCK`\|`LOW`\|`OUT_OF_STOCK`), sin capa de traducción. |
| `product-card.tsx` | Props planas de `ProductListItem`. Muestra "Desde S/X" + 1 badge de stock. Sin link a `/p/[slug]` (no existe todavía). |
| `catalog-grid.tsx` | Deja de ser `"use client"`. Recibe `products`/`categories` ya resueltos. Pills de categoría = `<Link href="/?category=<id>">`. Suma control **"Ordenar"** (`<select>` nativo, cambia `?sort=`). Estado vacío cuando no hay resultados. |
| `hero-search.tsx` | `<form method="get" action="/">`, sin JS. Preserva `category`/`sort` activos con inputs ocultos al buscar. |
| `trust-stats.tsx` (nuevo) | Franja de 4 datos: 3 son afirmaciones de política ya decidida (licencias originales, reposición 7 días, soporte real) y 1 es un número real — `total` de `fetchCatalogProducts` ("`{total}` herramientas en catálogo"), no un conteo de técnicos inventado. |
| `how-it-works.tsx` (nuevo) | 4 pasos estáticos (Elegí → Pagá → Subí tu comprobante → Recibí tu clave). Sin temporizados inventados. |
| Hero (dentro de `app/page.tsx` o un `hero.tsx` nuevo) | Tarjeta de vidrio flotante con los métodos de pago reales (`fetchPaymentMethods`, nombres tal cual los configuró el admin) + las 2 garantías reales (reposición 7 días, soporte WhatsApp). Sin contador de stock en vivo (D29) ni SLA inventado. |
| `app/page.tsx` | `async`, lee `searchParams` (`Promise`, Next 16) con `query`/`category`/`sort`; llama categorías + productos + métodos de pago en paralelo; `try/catch` con fallback si el backend no responde. |
| `app/loading.tsx`, `app/error.tsx` (nuevos) | Primera convención de loading/error de la app — no existe ninguno hoy. |

**Elimina** `lib/mock-catalog.ts` completo (confirmar con grep que nada más lo importa antes de borrar).
Actualiza la mención a `mock-catalog.ts` en `CLAUDE.md` (hoy dice "seguir el patrón... hasta conectar la API").

## Testing

- Vitest (mismo patrón que `api-client.test.ts`): `catalog-client.ts` — construcción de query params (incluido
  `sort`), mapeo de respuesta, manejo de error de red/5xx.
- Backend: caso nuevo en `catalog.e2e-spec.ts` para `sort` (3 valores + default).
- Manual: `npm run dev -- --port 3001`, revisar filtro de categoría, búsqueda, orden, y estado vacío contra el
  backend real (`docker compose up -d`, seed cargado) en un navegador antes de cerrar la tarea.

## Fuera de alcance (explícito)

- `/p/[slug]` (S2), carrito, checkout (S3) — paso 3 del roadmap.
- Orden "más populares" — necesita datos de ventas (paso 10).
- Las 12 pantallas restantes exploradas con Stitch — cada una es su propio spec cuando llegue su paso en el
  roadmap; ninguna de sus métricas/features inventadas (sistema de puntos, conversión de moneda automática,
  detección de fraude automática, botón de reset de HWID) se construye — no están decididas.

## Docs a actualizar al cerrar

`docs/06-api.md` (sort), `docs/02-requerimientos-funcionales.md` (RF-CAT de listado/búsqueda/filtro/orden),
`docs/07-diseno-ui.md` (S1 estado + tokens finales), `docs/10-orden-de-ejecucion.md` (paso 2 ✅).
