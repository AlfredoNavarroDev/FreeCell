# CLAUDE.md — Free Cell (tienda de licencias)

Marca comercial: **Free Cell**. Tienda web para vender **licencias (claves) de herramientas de servicio técnico de celulares**. Operación manual: el operador
carga lotes de licencias; el cliente arma un carrito, reserva, paga por Yape/Plin/transferencia y sube un comprobante; el operador aprueba y el sistema
entrega la(s) licencia(s) reservada(s). Autor: Alfredo (desarrollo). Idioma del producto y de la documentación: **español (es-PE)**.

## Estructura del repositorio
```
FreeCell/
  backend/   API NestJS — Sprint 1 (Fundaciones) reconstruido; ver docs/backend/
  frontend/  App Next.js (scaffold + pantalla S1/Catálogo con datos de ejemplo)
  docs/      Documentación de producto (fuente de verdad del alcance)
  docs/design/  Mockups visuales de referencia (no son código a reutilizar)
```
Todo lo que no sea `backend/` o `frontend/` vive en `docs/` (complementario). Repositorio remoto:
`git@github.com:AlfredoNavarroDev/FreeCell.git`.

## Estado
- ✅ **Sprint 1 (Fundaciones) reconstruido el 2026-10-14**: esquema completo con lógica en Postgres, auth con
  refresh rotativo, reserva de carrito, colas, Docker. Ver `docs/backend/`.
- 🟡 `frontend/`: scaffold (`create-next-app`, TypeScript + Tailwind v4 + App Router) + **pantalla S1 (Catálogo)**
  construida con datos de ejemplo (sin conectar a la API todavía) + **sesión NextAuth** (credentials + Google,
  refresh proactivo, logout con revocación, rutas `/admin` y `/cuenta` protegidas; RF-AUT-09/10, D46/D53/D56).
  S2–S11 van por sprint.
- ⬜ **Sprints 2–4**: catálogo (resto), CRUD de catálogo, comprobantes (R2), panel admin, reclamos, soporte
  (tickets), reseñas, correo/WhatsApp, despliegue real en Fly.io. Ver `docs/08-plan-de-sprints.md`.
- Referencias visuales en `docs/design/` (pantallas S1–S11).
- Brainstorming de Sprint 2–4 **completado** (2026-10-05): decisiones **D14–D55** en `docs/09-decisiones-y-preguntas-abiertas.md`. Sin preguntas abiertas. Incluye login con Google (D53/D54) y reportes admin con KPIs definidos (D55: ventas día/semana, margen, stock valorizado, top planes).
- Diseño de Fundaciones (backend) **completado** (2026-10-06): decisiones **D56–D65** en `docs/09-decisiones-y-preguntas-abiertas.md` (tokens y refresh, lógica en Postgres, monedas PEN/USD, métodos de pago configurables).

> Los estados ✅ dentro de `docs/02`, `docs/03` y `docs/06` para RF-AUT-01..05, RF-COM-01, 02, 05, 06, RNF-SEG-03/04/08 y
> RNF-OBS-01/02 ya están verificados contra `backend/src/`; el resto sigue describiendo el **objetivo** del
> brainstorming de Sprint 2–4, no código actual. Verifica contra `backend/src/` antes de asumir que algo más ya
> está implementado.

## Mapa de documentación
| Archivo | Contenido |
|---|---|
| `docs/00-brief-brainstorming.md` | Cómo arrancar y prompt para la skill de brainstorming |
| `docs/01-vision-y-alcance.md` | Negocio, actores, alcance MVP, glosario |
| `docs/02-requerimientos-funcionales.md` | RF con prioridad, estado y criterios |
| `docs/03-requerimientos-no-funcionales.md` | Seguridad, integridad, rendimiento, disponibilidad, observabilidad, legal… |
| `docs/04-arquitectura.md` | Componentes, máquinas de estado, flujos, despliegue |
| `docs/05-modelo-de-datos.md` | ERD, tablas, invariantes, cambios previstos |
| `docs/06-api.md` | Endpoints implementados y planificados |
| `docs/07-diseno-ui.md` | Tokens, componentes, pantallas S1–S8 |
| `docs/08-plan-de-sprints.md` | Sprints, definición de hecho, pruebas |
| `docs/09-decisiones-y-preguntas-abiertas.md` | Decisiones tomadas, preguntas abiertas, riesgos |
| `docs/10-orden-de-ejecucion.md` | Orden de prioridad recomendado para lo que falta (no reemplaza `docs/08`) |

## Comandos (`cd backend`)
```bash
cp .env.example .env     # completa JWT_SECRET, JWT_REFRESH_PEPPER (≥32 c.), LICENSE_ENC_KEY (32 bytes base64), ADMIN_*
docker compose up -d     # PostgreSQL 16 + Redis 7
npm install
npm run migration:run    # InitialSchema + DatabaseLogic (triggers, vistas, funciones)
npm run seed              # admin + catálogo demo + métodos de pago
npm run start:dev         # API en http://localhost:3000/health (dev: APP_ROLE=all corre API + workers)
npm run start:worker      # proceso worker aparte (processors de BullMQ, sin HTTP)
npm run typecheck && npm test && npm run test:e2e
npm run migration:generate -- src/database/migrations/Nombre   # tras cambiar entidades
docker compose --profile app up -d --build   # imagen de producción local: migrate + api + worker
```
Las pruebas e2e usan la base `licencias_test` y Redis `/1` (Docker la crea al primer arranque). No tocan datos de desarrollo.
Detalle completo (variables de entorno, scripts, puertos) en `docs/backend/README.md`.

## Reglas del proyecto
**Dominio (inviolables)**
1. Una licencia **nunca** se asigna a dos pedidos. La reserva usa `FOR UPDATE SKIP LOCKED` dentro de una transacción.
2. Los jobs de BullMQ son **idempotentes**: releen el estado en PostgreSQL antes de actuar. PostgreSQL es la fuente de verdad, Redis no.
3. Los pedidos `IN_REVIEW` **no** se liberan por expiración.
4. Las claves se guardan cifradas (AES-256-GCM). **Nunca** en logs, errores ni listados. Solo `reveal`/admin las descifran, y se audita.
5. Dinero en **céntimos enteros**; moneda `PEN`/`USD` en `plan_prices.currency`/`orders.currency`, sin default: la elige el cliente (D61, reemplaza en parte a D51). El precio se congela en `order_items.unitPriceCents`.
6. Toda mutación crítica (carga de lotes, aprobar/rechazar pago, revelar clave, reposición, cambios de precio) escribe `audit_logs`.
7. Autorización por **rol y por propiedad** del recurso (un cliente nunca ve pedidos ajenos).
8. Máx. **2 reintentos** tras rechazo de pago; al 3.º el pedido se cancela (D18).
9. Reposición: máx. **1 por pedido**, ventana **7 días**; sin stock, el pedido espera (no hay reembolso automático) (D25, D26).
10. `payments.operationNumber` y `payments.proofHash` son **únicos**: comprobante reutilizado se bloquea automático (D21).

**Código**
- NestJS por módulos de dominio; DTOs con `class-validator` (whitelist). TypeScript con `strictNullChecks`.
- Entidades, rutas y código en **inglés**; mensajes al usuario y documentación en **español**.
- Cambios de esquema = **migración** (`synchronize` solo en tests). Nunca editar una migración ya aplicada.
- Flujos con estado, stock o dinero requieren prueba **e2e contra Postgres/Redis reales** (incluida la concurrencia).
- **No subir** `@nestjs/config`, `jwt`, `passport`, `bullmq`, `typeorm` a la v12: son solo ESM y rompen con CommonJS/Jest.
- No inventar datos de negocio: usar placeholders `[..]` (productos, precios, números de pago, reseñas).
- Lógica crítica también en Postgres (triggers, CHECK, funciones; D57): un cambio de reglas de estado exige migración nueva.
- Tipos usados solo como tipo van con `import type` (o `type` inline en la misma línea si el módulo también exporta un
  valor usado de verdad) — **excepto** un tipo usado como el tipo de un parámetro de constructor de una clase con DI
  (`@Injectable()` y similares): ese debe quedar como import de valor normal, porque `emitDecoratorMetadata` necesita
  la referencia real en el JS compilado para que Nest la resuelva (`import type` la borra y Nest ya no puede inyectarla).
  `@typescript-eslint/consistent-type-imports` ya respeta este caso automáticamente cuando `emitDecoratorMetadata` está
  activo en `tsconfig.json`.

**Frontend** (`cd frontend`; `npm run dev -- --port 3001` → http://localhost:3001, D60)
- Next.js 16 (App Router) + TypeScript + Tailwind v4. Componentes en `src/components/`, datos de ejemplo en `src/lib/`.
- ⚠️ Next.js 16 tiene cambios de ruptura frente a versiones anteriores (ver `frontend/AGENTS.md` y
  `frontend/node_modules/next/dist/docs/`): `params`/`searchParams` son `Promise`, `middleware` se renombró a `proxy`.
- Sesión con **NextAuth** (credentials + Google) — ✅ implementada (Sprint 2, D46/D53/D56; RF-AUT-09/10). Seguir tokens y pantallas de `docs/07-diseno-ui.md`.
- Accesibilidad AA: elementos nativos (`button`, `a`, `label`), objetivos ≥ 44 px, el color nunca es el único indicador (ver `StockBadge`).
- Panel admin (ruta `/admin`, misma app): aprobar un pago en ≤ 2 clics, avance automático al siguiente, sin recargas.
- No inventar datos de negocio: seguir el patrón de `src/lib/mock-catalog.ts` (placeholders `[..]`) hasta conectar la API.

**Despliegue**
- API + workers + Redis en **Fly.io**; web en Vercel; Postgres en Neon; archivos en Cloudflare R2 (reemplaza Render/Upstash, D48/D49).

## Git y commits
- Remoto: `git@github.com:AlfredoNavarroDev/FreeCell.git`.
- **Nunca** agregar coautor en los commits (sin línea `Co-Authored-By`, sea Claude u otra herramienta). Autor único: Alfredo.
- Commits nuevos, no `--amend`, salvo que se pida explícitamente. No usar `--no-verify` ni saltar hooks.
- No hacer `push` sin que el usuario lo pida explícitamente en ese momento.

## Cómo trabajar aquí
- Antes de una tarea, localiza su RF en `docs/02` y su fila en `docs/06`. Al terminar, actualiza el estado (⬜ → ✅) en los documentos afectados.
- Si cambias esquema/API/requisitos, actualiza `docs/05`, `docs/06`, `docs/02` en el mismo cambio.
- Ante una decisión no cubierta, regístrala en `docs/09` (sección A) con su razón.
- Si algo contradice este archivo, **pregunta** antes de seguir.
