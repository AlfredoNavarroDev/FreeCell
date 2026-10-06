# Backend — Free Cell

API NestJS (TypeScript), recién regenerada con el CLI oficial (`nest new`) el 2026-10-05. El código de Sprint 1
(modelo de datos, auth con roles, cifrado de claves, reserva con `SKIP LOCKED`, colas BullMQ) se descartó a propósito
y queda por reconstruir con el mismo alcance — sigue documentado en `../docs/02` (RF), `../docs/05` (modelo de datos),
`../docs/06` (API) y `../docs/08` (plan de sprints). El historial de git conserva el código anterior si hace falta
consultarlo (commit `dd8c197`).

## Cómo levantarlo
```bash
npm install
npm run start:dev    # http://localhost:3000
npm run test
npm run test:e2e
```

## Próximo paso
Reconstruir Sprint 1 según `../docs/08-plan-de-sprints.md`: entidades TypeORM, migración inicial, auth con roles,
cifrado AES-256-GCM, reserva con `SELECT ... FOR UPDATE SKIP LOCKED`, colas BullMQ (reserva + notificaciones
idempotentes), seed y Docker Compose (Postgres + Redis). Ver `../CLAUDE.md` para las reglas inviolables del dominio.
