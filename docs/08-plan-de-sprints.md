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

## Sprint 1 — Fundaciones ✅ (completado)
Modelo de datos y migración inicial · auth con roles · cifrado de claves · colas BullMQ · reserva con `SKIP LOCKED` ·
liberación diferida idempotente + barrido · cola de notificaciones idempotente · seed · Docker Compose · 12 pruebas (5 unit + 7 e2e).

## Sprint 2 — Catálogo y compra
- [ ] Módulo `catalog`: listado, búsqueda, categorías, ficha con planes y `stockState` (RF-CAT-01..07).
- [ ] Módulo `storage`: URLs firmadas de R2 (subida privada, validación de tipo/tamaño) (RNF-SEG-09).
- [ ] Módulo `payments`: subir comprobante → pedido `IN_REVIEW` (RF-COM-04); cancelar pedido (RF-COM-08).
- [ ] `GET /orders`, `GET /orders/:id`, reveal de clave **con auditoría** (RF-PED-01..04).
- [ ] Cambios de esquema decididos en el brainstorming (`orderNumber`, `requiresToolUsername`, etc.).
- [ ] Rate limiting y helmet.
- [ ] Crear `web/` (Next.js): S1, S2, S3, S4 con datos reales.
- Pruebas: reserva → comprobante → `IN_REVIEW` no se libera; IDOR (cliente B no ve pedido de A); límites de archivo.

## Sprint 3 — Operación (panel admin)
- [ ] `inventory`: vista de stock, **preview + carga de lotes** (texto/CSV), duplicados por hash, anulación (RF-ADM-20..24).
- [ ] `admin/payments`: cola, **aprobar y entregar** (transacción), rechazar con motivo (RF-ADM-10..14).
- [ ] `claims`: reclamo del cliente + **reposición** (RF-REC, RF-ADM-30..33).
- [ ] Proveedor real de correo en la cola `notifications` (RF-NOT-03..05).
- [ ] `admin/summary` (RF-ADM-01..02).
- [ ] Web: S5, S6, S7, S8 con avance automático y estados vacíos.
- Pruebas: aprobar dos veces el mismo pago (idempotencia); aprobar y expirar a la vez; reposición sin stock; carga con duplicados.

## Sprint 4 — Robustez y salida a producción
- [ ] Job repetible `low-stock-check` + alertas (RF-ADM-26, RNF-OBS-05).
- [ ] Bull Board en `/admin/queues` (solo ADMIN); logs estructurados (pino); `/health/ready`; Sentry.
- [ ] CI en GitHub Actions con servicios Postgres/Redis.
- [ ] Despliegue: Render + Vercel + Neon + Upstash + R2; migraciones en el pipeline; prueba de restauración de backup.
- [ ] Revisión legal mínima (privacidad, términos, reposición) y de accesibilidad.
- [ ] Pruebas de carga básicas sobre la reserva (RNF-REN-02).
- [ ] README del portafolio con diagramas y decisiones.

## Backlog posterior
Recuperar contraseña · verificación de correo · carrito y varias licencias por pedido · pasarela de pago automática ·
revendedores y precios por rol · reportes · WhatsApp · 2FA para admin · servicio directo de desbloqueo/reparación.

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
