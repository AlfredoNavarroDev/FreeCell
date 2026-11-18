# Free Cell

Tienda web para vender licencias (claves) de herramientas de servicio técnico de celulares. Operación manual: el
operador carga lotes de licencias; el cliente arma un carrito, reserva, paga por Yape/Plin/transferencia y sube un
comprobante; el operador aprueba y el sistema entrega la(s) licencia(s) reservada(s).

- `backend/` — API NestJS (Postgres + Redis/BullMQ), Sprint 1 reconstruido. Auth, catálogo, carrito/reserva, pagos,
  colas, auditoría, Bull Board, Sentry. CI (GitHub Actions) en verde. Ver `backend/README.md` y `docs/backend/`.
- `frontend/` — app Next.js (App Router), catálogo conectado a la API real, sesión NextAuth (credentials + Google),
  panel admin, reclamos, soporte por tickets, reseñas. Sprints 2–4 en curso (ver estado abajo). Ver `frontend/README.md`.
- `docs/` — requerimientos, arquitectura, modelo de datos, API, diseño UI, plan de sprints y decisiones (fuente de
  verdad del alcance).
- `docs/design/` — mockups visuales de referencia (no son código a reutilizar).
- `.github/workflows/` — CI (lint, typecheck, tests) para backend y frontend.
- `CLAUDE.md` — guía para Claude Code. Empieza por `docs/00-brief-brainstorming.md`.

## Estado

- ✅ Backend Sprint 1 (Fundaciones): esquema completo con lógica en Postgres, auth con refresh rotativo, reserva de
  carrito, colas, Docker.
- ✅ Sprint 4 (observabilidad + CI): Bull Board, alertas operativas, Sentry (backend + scaffolding frontend), pipeline
  CI en GitHub Actions.
- 🟡 Frontend: catálogo real, sesión NextAuth, reclamos (S8), soporte por tickets (S9/S11), reseñas (S11) ya
  implementados. CRUD de catálogo, correo/WhatsApp y despliegue real (Fly.io/Vercel/Neon) pendientes.
- Ver `docs/08-plan-de-sprints.md` (plan por sprint), `docs/10-orden-de-ejecucion.md` (prioridad de lo que falta) y
  `docs/11-bugs-pendientes.md` (deuda técnica conocida).

## Cómo levantar el proyecto

### Todo junto con Docker Compose (backend + frontend)

```bash
cp backend/.env.example backend/.env    # completa JWT_SECRET, JWT_REFRESH_PEPPER, LICENSE_ENC_KEY, ADMIN_*
cp frontend/.env.example frontend/.env  # completa AUTH_SECRET (openssl rand -base64 32)
docker compose --profile app up -d --build
docker compose --profile app exec api node dist/database/seed.js   # opcional: catálogo demo
```

Backend en http://localhost:3000, frontend en http://localhost:3001. `docker-compose.yml` (raíz) construye ambas
imágenes de producción; para desarrollo diario del backend con hot-reload, usa `backend/docker-compose.yml` (solo
Postgres + Redis) + `npm run start:dev` como se describe abajo.

### Backend (`cd backend`)

```bash
cp .env.example .env     # completa JWT_SECRET, JWT_REFRESH_PEPPER (≥32 c.), LICENSE_ENC_KEY (32 bytes base64), ADMIN_*
docker compose up -d     # PostgreSQL 16 + Redis 7
npm install
npm run migration:run    # InitialSchema + DatabaseLogic (triggers, vistas, funciones)
npm run seed              # admin + catálogo demo + métodos de pago
npm run start:dev         # API en http://localhost:3000/health (dev: APP_ROLE=all corre API + workers)
```

Pruebas: `npm run typecheck && npm test && npm run test:e2e` (e2e usa base `licencias_test` y Redis `/1`, no toca datos
de desarrollo).

### Frontend (`cd frontend`)

```bash
npm install
npm run dev -- --port 3001   # http://localhost:3001 (requiere backend corriendo)
```

Detalle completo de variables de entorno, scripts y puertos en `docs/backend/README.md` y `frontend/README.md`.
