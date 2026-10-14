# Backend — Free Cell

API NestJS (TypeScript) de la tienda de licencias Free Cell. Sprint 1 (Fundaciones): esquema completo con lógica
en Postgres (triggers, vistas, funciones), auth propia con refresh rotativo, reserva de carrito con
`SELECT ... FOR UPDATE SKIP LOCKED`, colas BullMQ idempotentes, cifrado AES-256-GCM y auditoría, Docker multi-stage.

Documentación completa (endpoints, variables de entorno, esquema, colas, despliegue): **`../docs/backend/README.md`**.

## Cómo levantarlo
```bash
cp .env.example .env     # ver ../docs/backend/README.md para generar los secretos
docker compose up -d     # PostgreSQL 16 + Redis 7
npm install
npm run migration:run
npm run seed
npm run start:dev        # http://localhost:3000/health
```

## Cómo probar
```bash
npm run typecheck
npm test                 # unitarias
npm run test:e2e          # e2e, contra Postgres/Redis reales
```

Reglas inviolables del dominio: `../CLAUDE.md`.
