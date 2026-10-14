# Colas (BullMQ)

**Archivos:** `src/orders/orders-queue.service.ts`, `src/orders/orders.processor.ts`,
`src/orders/order-release.service.ts`, `src/orders/orders.constants.ts`, `src/notifications/*.ts`,
`src/workers.module.ts`, `src/worker.module.ts`, `src/worker.ts`. Pruebas: `test/release.e2e-spec.ts`,
`test/notifications.e2e-spec.ts`.

Conexión Redis y opciones por defecto de job se registran una sola vez en `CoreModule`
(`BullModule.forRootAsync`): `attempts: 3`, `backoff: { type: 'exponential', delay: 5_000 }`,
`removeOnComplete: 1_000`, `removeOnFail: 5_000`.

## Cola `orders`

Constantes en `src/orders/orders.constants.ts`: `QUEUE_ORDERS = 'orders'`, `JOB_RELEASE = 'release'`,
`JOB_SWEEP = 'sweep-expired'`, `SWEEP_EVERY_MS = 5 * 60_000`, `RELEASE_DELAY_MARGIN_MS = 2_000`.

| Job | jobId / scheduler | Encolado por | Qué hace |
|---|---|---|---|
| `release` | `release-{orderId}` (`releaseJobId`) | `OrdersService.create`, tras el commit de la reserva, con `delay = ttlMinutes*60_000 + 2_000` (el margen evita llegar antes de que expire) | `OrderReleaseService.releaseIfExpired(orderId)` → `SELECT fn_release_order($1, 'EXPIRED', true)`; si devuelve `true`, audita `order.expired` |
| `sweep-expired` | `upsertJobScheduler(JOB_SWEEP, { every: SWEEP_EVERY_MS }, { name: JOB_SWEEP })`, registrado en `OrdersProcessor.onApplicationBootstrap` | Se registra solo (red de seguridad) | `OrderReleaseService.sweepExpired()` → `SELECT fn_release_expired()`; audita `order.expired` (`meta: {via: 'sweep'}`) por cada id devuelto |

`upsertJobScheduler` hace que reiniciar el worker no duplique el barrido. Toda la lógica de qué pedidos liberar vive
en Postgres (`fn_release_order`/`fn_release_expired`, ver `database.md`): el handler de TypeScript solo llama a la
función y audita si liberó algo, así que repetir el job o el barrido sobre el mismo pedido no hace nada la segunda
vez (idempotente, regla 2).

## Cola `notifications`

`QUEUE_NOTIFICATIONS = 'notifications'` (`src/notifications/notification.types.ts`). `NotificationsService.enqueue`
agrega un job con `name = job.template` y **`jobId = job.key`** — encolar dos veces la misma `key` (p. ej.
`order-created-{orderId}`) no crea un segundo job.

Flujo del processor (`NotificationsProcessor` → `NotificationSender.handle`):
1. `INSERT INTO notification_logs (key, channel, recipient, template) VALUES (...) ON CONFLICT (key) DO NOTHING RETURNING id`.
   Si no insertó nada (`claimed.length === 0`), el mensaje ya se envió antes → termina con `'skipped'` sin llamar al canal.
2. Si insertó, llama a `NotificationChannel.send(job)`.
3. Si el envío falla, **borra** la fila de `notification_logs` (para que el reintento de BullMQ pueda reclamar la
   huella otra vez) y relanza el error, que activa el backoff/reintento de BullMQ (3 intentos, exponencial).

`NotificationJob` (`notification.types.ts`): `{key, template: 'order-created', recipient, data}`. `data` nunca
lleva claves de licencia ni tokens (comentario en el tipo).

`LogChannel` (`src/notifications/channels/log.channel.ts`) es la única implementación en Fundaciones: registra en
el logger de Nest con el destinatario enmascarado (`maskEmail`: `juan@correo.pe` → `j***@correo.pe`), nunca el
correo completo ni datos sensibles. `NOTIFICATION_CHANNEL` (token de inyección) permite reemplazarla en Sprint 3
(Resend + enlaces `wa.me`) sin tocar `NotificationSender`.

## Procesos y `APP_ROLE`

- `src/main.ts` arranca `AppModule` con HTTP. `src/worker.ts` arranca `WorkerModule`
  (`NestFactory.createApplicationContext`, sin HTTP) y cierra con `enableShutdownHooks()` en `SIGTERM`.
- `AppModule` (`app.module.ts`) decide si importar `WorkersModule` (que registra `OrdersProcessor` y
  `NotificationsProcessor`) según `runWorkersInApi()`: lee `process.env.APP_ROLE`, o si falta, `'all'` fuera de
  producción y `'api'` en producción.
  - `APP_ROLE=all` (default en dev): la API y los processors corren en el mismo proceso.
  - `APP_ROLE=api`: la API no registra processors; deben correr en el proceso worker aparte.
  - `APP_ROLE=worker`: usar el entrypoint `worker.ts` (no aplica a `AppModule`, es el valor que se exporta a ese
    proceso vía variables de entorno/Compose/Fly).
- `WorkerModule` (`worker.module.ts`) siempre importa `WorkersModule`: el proceso worker corre los processors sin
  condicionar por `APP_ROLE` (se asume que si lo arrancaste, es porque `APP_ROLE=worker`).
- En Docker/Fly: una sola imagen, dos comandos (`node dist/main.js` para la API, `node dist/worker.js` para el
  worker) — ver `deployment.md`.
