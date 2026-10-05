# CLAUDE.md — Tienda de licencias

Tienda web para vender **licencias (claves) de herramientas de servicio técnico de celulares**. Operación manual: el operador
carga lotes de licencias; el cliente reserva, paga por Yape/Plin/transferencia y sube un comprobante; el operador aprueba y el sistema
entrega la licencia reservada. Autor: Alfredo (desarrollo). Idioma del producto y de la documentación: **español (es-PE)**.

## Estado
- ✅ **Sprint 1** (`api/`): modelo de datos, migración, auth con roles, cifrado de claves, reserva con `SKIP LOCKED`, colas BullMQ, notificaciones idempotentes. 5 pruebas unitarias + 7 e2e en verde.
- ⬜ **Sprints 2–4**: catálogo, comprobantes (R2), panel admin, reclamos, correo, despliegue. Ver `docs/08-plan-de-sprints.md`.
- ⬜ `web/` (Next.js) **aún no existe**. Referencias visuales en `docs/design/` (8 pantallas).
- Antes de implementar, resolver las preguntas abiertas en `docs/09-decisiones-y-preguntas-abiertas.md` (ver `docs/00-brief-brainstorming.md`).

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

## Comandos (`cd api`)
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
5. Dinero en **céntimos enteros** (PEN). El precio se congela en `order_items.unitPriceCents`.
6. Toda mutación crítica (carga de lotes, aprobar/rechazar pago, revelar clave, reposición, cambios de precio) escribe `audit_logs`.
7. Autorización por **rol y por propiedad** del recurso (un cliente nunca ve pedidos ajenos).

**Código**
- NestJS por módulos de dominio; DTOs con `class-validator` (whitelist). TypeScript con `strictNullChecks`.
- Entidades, rutas y código en **inglés**; mensajes al usuario y documentación en **español**.
- Cambios de esquema = **migración** (`synchronize` solo en tests). Nunca editar una migración ya aplicada.
- Flujos con estado, stock o dinero requieren prueba **e2e contra Postgres/Redis reales** (incluida la concurrencia).
- **No subir** `@nestjs/config`, `jwt`, `passport`, `bullmq`, `typeorm` a la v12: son solo ESM y rompen con CommonJS/Jest.
- No inventar datos de negocio: usar placeholders `[..]` (productos, precios, números de pago, reseñas).

**Frontend (cuando se cree)**
- Next.js (App Router) + TypeScript. Seguir tokens y pantallas de `docs/07-diseno-ui.md`.
- Accesibilidad AA: elementos nativos (`button`, `a`, `label`), objetivos ≥ 44 px, el color nunca es el único indicador.
- Panel admin: aprobar un pago en ≤ 2 clics, avance automático al siguiente, sin recargas.

## Cómo trabajar aquí
- Antes de una tarea, localiza su RF en `docs/02` y su fila en `docs/06`. Al terminar, actualiza el estado (⬜ → ✅) en los documentos afectados.
- Si cambias esquema/API/requisitos, actualiza `docs/05`, `docs/06`, `docs/02` en el mismo cambio.
- Ante una decisión no cubierta, regístrala en `docs/09` (sección A) con su razón.
- Si algo contradice este archivo, **pregunta** antes de seguir.
