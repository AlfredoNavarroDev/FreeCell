# CLAUDE.md — Free Cell (tienda de licencias)

Marca comercial: **Free Cell**. Tienda web para vender **licencias (claves) de herramientas de servicio técnico de celulares**. Operación manual: el operador
carga lotes de licencias; el cliente arma un carrito, reserva, paga por Yape/Plin/transferencia y sube un comprobante; el operador aprueba y el sistema
entrega la(s) licencia(s) reservada(s). Autor: Alfredo (desarrollo). Idioma del producto y de la documentación: **español (es-PE)**.

## Estructura del repositorio
```
FreeCell/
  backend/   API NestJS (Sprint 1 implementado y probado)
  frontend/  App Next.js (Sprint 2, aún no existe — ver frontend/README.md)
  docs/      Documentación de producto (fuente de verdad del alcance)
  docs/design/  Mockups visuales de referencia (no son código a reutilizar)
```
Todo lo que no sea `backend/` o `frontend/` vive en `docs/` (complementario). Repositorio remoto:
`git@github.com:AlfredoNavarroDev/FreeCell.git`.

## Estado
- ✅ **Sprint 1** (`backend/`): modelo de datos, migración, auth con roles, cifrado de claves, reserva con `SKIP LOCKED`, colas BullMQ, notificaciones idempotentes. 5 pruebas unitarias + 7 e2e en verde.
- ⬜ **Sprints 2–4**: catálogo, carrito, CRUD de catálogo, comprobantes (R2), panel admin, reclamos, soporte (tickets), reseñas, NextAuth (+Google), correo/WhatsApp, despliegue en Fly.io. Ver `docs/08-plan-de-sprints.md`.
- ⬜ `frontend/` (Next.js) **aún no existe**. Referencias visuales en `docs/design/` (pantallas S1–S11).
- Brainstorming de Sprint 2–4 **completado** (2026-10-05): decisiones **D14–D55** en `docs/09-decisiones-y-preguntas-abiertas.md`. Sin preguntas abiertas. Incluye login con Google (D53/D54) y reportes admin con KPIs definidos (D55: ventas día/semana, margen, stock valorizado, top planes).

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

## Comandos (`cd backend`)
```bash
cp .env.example .env     # completa LICENSE_ENC_KEY (32 bytes base64), JWT_SECRET, ADMIN_*
docker compose up -d     # PostgreSQL 16 + Redis 7
npm install
npm run migration:run    # tablas
npm run seed             # admin + producto demo
npm run start:dev        # http://localhost:3000/health
npm run typecheck && npm test && npm run test:e2e
npm run migration:generate -- src/database/migrations/Nombre   # tras cambiar entidades
```
Las pruebas e2e usan la base `licencias_test` y Redis `/1` (Docker la crea al primer arranque). No tocan datos de desarrollo.

## Reglas del proyecto
**Dominio (inviolables)**
1. Una licencia **nunca** se asigna a dos pedidos. La reserva usa `FOR UPDATE SKIP LOCKED` dentro de una transacción.
2. Los jobs de BullMQ son **idempotentes**: releen el estado en PostgreSQL antes de actuar. PostgreSQL es la fuente de verdad, Redis no.
3. Los pedidos `IN_REVIEW` **no** se liberan por expiración.
4. Las claves se guardan cifradas (AES-256-GCM). **Nunca** en logs, errores ni listados. Solo `reveal`/admin las descifran, y se audita.
5. Dinero en **céntimos enteros**; moneda en `plans.currency`/`orders.currency` (default `PEN`, D51). El precio se congela en `order_items.unitPriceCents`.
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

**Frontend (cuando se cree)**
- Next.js (App Router) + TypeScript + Tailwind/CSS Modules. Sesión con **NextAuth** (credentials provider contra la API). Seguir tokens y pantallas de `docs/07-diseno-ui.md`.
- Accesibilidad AA: elementos nativos (`button`, `a`, `label`), objetivos ≥ 44 px, el color nunca es el único indicador.
- Panel admin (ruta `/admin`, misma app): aprobar un pago en ≤ 2 clics, avance automático al siguiente, sin recargas.

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
