# 08 · Plan de sprints y estrategia de pruebas

Duración orientativa: 1 semana por sprint. Cada sprint termina con funcionalidad desplegable y pruebas en verde.

## Definición de "hecho" (para toda tarea)
- Cumple los criterios de aceptación del RF correspondiente.
- Pruebas: unitarias para lógica pura; **e2e contra Postgres y Redis reales** para flujos con estado, stock o dinero.
- Autorización verificada (rol y propiedad del recurso) con al menos una prueba negativa.
- Mutaciones críticas escriben auditoría.
- Sin claves en logs ni respuestas de listados.
- `npm run typecheck`, `npm test` y `npm run test:e2e` pasan.
- Documentación actualizada (`docs/` y, si cambia el esquema, migración generada).

## Sprint 1 — Fundaciones ✅ (reconstruido 2026-10-14)
Entregado (detalle verificado contra el código en `docs/backend/`):
- Esquema completo (19 tablas) en una sola migración inicial + lógica en Postgres (triggers, vistas, funciones de
  liberación) en una segunda migración (D57).
- Auth propia: JWT de 15 min + refresh opaco rotativo de 30 días con ventana de gracia de 30 s y detección de
  reuso por familia (D56); guards globales (`JwtAuthGuard`/`RolesGuard`) y rate limiting en Redis.
- Cifrado AES-256-GCM de claves + HMAC-SHA256 para duplicados (D58); auditoría inmutable (`audit_logs`).
- Carrito: `POST /orders` reserva N ítems en una transacción con `SELECT ... FOR UPDATE SKIP LOCKED`, orden fijo
  por `planId` (sin deadlocks entre carritos cruzados), rechazo completo si falta stock de un ítem (D30).
- Monedas (D61): `plan_prices` por moneda, precio congelado en `order_items`; métodos de pago administrables
  (D63–D65, entidad y trigger de moneda listos, servicio en Sprint 2).
- Colas BullMQ: `orders` (`release` + `sweep-expired` cada 5 min) y `notifications` (idempotente por `notification_logs`),
  ambas idempotentes; proceso API y proceso worker separables por `APP_ROLE`.
- Observabilidad: `/health`, `/health/ready`, logs JSON con `pino` y `X-Request-Id`, Swagger en `/docs` fuera de
  producción, helmet + CORS + rate limiting.
- Seed idempotente (admin, catálogo demo, métodos de pago, settings), Docker multi-stage, `docker-compose.yml`
  (perfil `app`), borrador de `fly.toml`.
- Pruebas: unitarias (`CryptoService`, `sanitizeMeta`, `validateEnv`, `decideRefresh`, `AllExceptionsFilter`) + e2e
  contra Postgres/Redis reales (`auth`, `orders`, `concurrency`, `release`, `db-logic`, `notifications`, `health`,
  `schema`, `seed`), `npm run typecheck && npm test && npm run test:e2e` en verde.

> El código original de este sprint (reiniciado el 2026-10-05) se descartó a propósito; el commit `dd8c197` queda
> en el historial de git solo como referencia histórica, ya reemplazado por el código actual.

> Alcance de Sprint 2–4 revisado tras el brainstorming de 2026-10-05 (`docs/09`, decisiones D14–D52). Creció frente al plan
> original: carrito desde el MVP (D30), CRUD de catálogo adelantado (D38), sistema de tickets (D34), reseñas moderadas (D33)
> y migración de sesión a NextAuth (D46). Si el ritmo real no acompaña, lo primero que se puede mover a Sprint 3 es el CRUD
> de catálogo (D38 permite usar seed/SQL como respaldo).

## Sprint 2 — Catálogo, carrito y compra
> Ya entregado en Sprint 1 (quitado de esta lista): el esquema completo (incluye `requiresToolUsername`,
> `orderNumber`, `cancelReason`, `currency`/`plan_prices`, `license_items.replacesId`, únicos de `payments`, índice
> parcial de `orderItemId`, tablas `settings`/`support_tickets`/`ticket_messages`/`reviews`), el carrito en
> `POST /orders` (reserva N ítems en una transacción, D30), y rate limiting + helmet.
- [x] Módulo `catalog`: listado, búsqueda, categorías, ficha con planes, `stockState` solo por estado (RF-CAT-01..07, D29).
- [ ] Módulo `storage`: URLs firmadas de R2 (subida privada, validación de tipo/tamaño) (RNF-SEG-09).
- [ ] Módulo `payments`: subir comprobante con `paymentMethodId`/`operationNumber` → pedido `IN_REVIEW`; bloqueo
      automático de duplicado por `(paymentMethodId, operationNumber)`/hash (RF-COM-04, D21, D63, D64); CRUD admin de
      `payment_methods` auditado (D65); cancelar pedido ya implementado desde Sprint 1 (RF-COM-08).
- [ ] Checkbox de declaración de licitud obligatorio al pagar (RF-COM-13, D43).
- [ ] `GET /orders`, reveal de clave **con auditoría** (RF-PED-01..04); `GET /orders/:id` y cancelar ya implementados.
- [ ] CRUD admin de catálogo: productos (incl. `requiresToolUsername`), planes (con precios por moneda, D61),
      categorías (RF-ADM-40, D38).
- [ ] Verificación de correo obligatoria antes de la primera compra; límite de monto para cliente nuevo (RF-AUT-07, D22).
- [ ] `POST /auth/google`: find-or-create por correo, `emailVerifiedAt` automático (D53, D54, RF-AUT-10).
- [x] Scaffold `frontend/` (`create-next-app`, Tailwind v4, App Router) + **S1 (Catálogo)** con datos de ejemplo (2026-10-05).
- [ ] Sesión NextAuth: credentials + **Google provider** (D46, D53).
- [ ] Conectar S1 a la API real; construir S2, S3 (con carrito), S4, S9 (tickets cliente), S10 (catálogo admin).
- Pruebas: reserva de carrito (N ítems, algunos agotados → rechazo completo); `IN_REVIEW` no se libera; IDOR (cliente B no ve
  pedido de A); comprobante con `operationNumber` repetido → 409; límites de archivo.

## Sprint 3 — Operación, soporte y reseñas
- [ ] `inventory`: vista de stock, **preview + carga de lotes** (texto/CSV), duplicados por hash, anulación (RF-ADM-20..24).
- [ ] `admin/payments`: cola, **aprobar y entregar** (transacción; incluye ruta `PENDING_ACTIVATION` para productos con
      `requiresToolUsername`, D14), rechazar con reintento 1–2 y cancelación al 3.er rechazo (RF-ADM-10..15, D18).
- [ ] `POST /admin/orders/:id/activate` para cerrar `PENDING_ACTIVATION → DELIVERED`.
- [ ] `claims`: reclamo del cliente + **reposición** vía `license_items.replacesId`, máx. 1 por pedido, ventana 7 días
      (RF-REC, RF-ADM-30..33, D25, D26, D28). Reembolso manual registrado en auditoría (D27).
- [ ] `support`: tickets del cliente y cola de admin (RF-SUP-01..04, D34).
- [ ] `reviews`: creación por cliente con pedido `DELIVERED` + moderación admin (RF-CAT-10, RF-ADM-45, D33).
- [ ] Proveedor real de correo (Resend) + enlaces WhatsApp `wa.me` en la cola `notifications` (RF-NOT-03..07, D32, D37).
- [ ] `admin/summary` con contadores básicos (RF-ADM-01..02).
- [ ] `admin/reports`: ventas por día/semana, margen por producto, stock valorizado, top planes vendidos (RF-ADM-43, D55).
- [ ] `settings`: SLA de revisión (24h, D19), monto máximo cliente nuevo (D22), TTL, horario, datos de pago.
- [ ] Web: S5, S6, S7, S8, S11 (soporte y reseñas admin) con avance automático y estados vacíos.
- Pruebas: aprobar dos veces el mismo pago (idempotencia); aprobar y expirar a la vez; reposición sin stock (queda en espera,
  no reembolso automático); reintento de pago tras rechazo (2 máx.); carga con duplicados; ticket cerrado rechaza nuevos
  mensajes del cliente.

## Sprint 4 — Robustez y salida a producción
- [ ] Job repetible `low-stock-check` + alertas (RF-ADM-26, RNF-OBS-05).
- [ ] Alerta al operador tras 24h en `IN_REVIEW` sin cancelar automáticamente (D19).
- [ ] Bull Board en `/admin/queues` (solo ADMIN); logs estructurados (pino); `/health/ready`; Sentry.
- [ ] CI en GitHub Actions con servicios Postgres/Redis.
- [ ] Despliegue: Fly.io (API + workers + Redis propio) + Vercel (web) + Neon (Postgres) + R2 (D48, D49); migraciones en el
      pipeline; prueba de restauración de backup.
- [ ] Publicar términos de uso / privacidad / reposición (borrador propio, D41) marcados `[PENDIENTE REVISIÓN LEGAL]`;
      revisión de accesibilidad.
- [ ] Pruebas de carga sobre la reserva de carrito (N ítems concurrentes) (RNF-REN-02).
- [ ] README del portafolio con diagramas y decisiones.

## Backlog posterior
Recuperar contraseña · pasarela de pago automática (D23) · boleta/factura SUNAT (D40) · revendedores y precios por rol ·
login social adicional (Facebook u otros, fuera de D53) · WhatsApp con API oficial · 2FA para admin (D36) · rotación de
llave de cifrado (D50) · separación de roles ADMIN/OWNER (D35) · servicio directo de desbloqueo/reparación.

## Estrategia de pruebas
| Nivel | Qué cubre | Herramienta | Dónde |
|---|---|---|---|
| Unitaria | Lógica pura (cifrado, cálculo de stock, validaciones) | Jest | `src/**/*.spec.ts` |
| e2e API | Flujos con estado: auth, reserva, concurrencia, liberación, aprobación, reclamos | Jest + Supertest + Postgres/Redis reales | `test/*.e2e-spec.ts` |
| Concurrencia | N compras simultáneas vs stock M; aprobar vs expirar | Promise.all en e2e | `test/` |
| Seguridad | IDOR, roles, rate limit, validación | e2e negativos | `test/` |
| Frontend | Flujos críticos de punta a punta | Playwright (propuesto) | `web/e2e` |
| Carga | Reserva con 50 concurrentes | k6/autocannon (propuesto) | Sprint 4 |

Las pruebas e2e usan la base `licencias_test` y el Redis `/1`: nunca tocan datos de desarrollo.
