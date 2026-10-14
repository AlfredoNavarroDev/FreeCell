# Despliegue

**Archivos:** `backend/Dockerfile`, `backend/.dockerignore`, `backend/docker-compose.yml`, `backend/fly.toml`.
El despliegue real a Fly.io es **Sprint 4**; lo de aquí es la configuración ya escrita y probada localmente
(`docker compose --profile app up -d --build`).

## Dockerfile (multi-stage)

Una imagen, dos procesos: `node dist/main.js` (API) y `node dist/worker.js` (worker). Etapas:
1. **`base`** (`node:22-bookworm-slim`).
2. **`deps`**: copia `package.json`, `package-lock.json` y `.npmrc` (fija `legacy-peer-deps=true`: sin esto, `npm ci`
   puede fallar por el peer opcional de `ioredis` en `typeorm`), `npm ci` con caché de BuildKit.
3. **`build`**: copia `tsconfig*.json`, `nest-cli.json` y `src/`, corre `npm run build` (`nest build`).
4. **`prod-deps`**: `npm ci --omit=dev` sobre una base limpia (sin devDependencies en la imagen final).
5. **`runtime`**: instala `tini`, copia `node_modules` (de `prod-deps`) y `dist/` (de `build`) con `--chown=node:node`,
   `USER node`, `ENV NODE_ENV=production PORT=3000`, `EXPOSE 3000`,
   `HEALTHCHECK` que hace `fetch` a `http://127.0.0.1:$PORT/health` cada 30 s, `ENTRYPOINT ["/usr/bin/tini","--"]`,
   `CMD ["node", "dist/main.js"]` (el worker sobreescribe el `command` en Compose/Fly).

`.dockerignore` excluye `node_modules`, `dist`, `coverage`, `test`, `.env*` (con excepción explícita de
`!.env.example`), `*.md`, `docker-compose.yml`, `fly.toml`, `.git`.

Las migraciones se corren con la misma imagen: `node dist/database/run-migrations.js`
(`src/database/run-migrations.ts` compilado).

## `docker-compose.yml`

- **Sin perfil** (siempre activos en desarrollo): `postgres` (`postgres:16-alpine`, puertos `5432`/`5433`,
  volumen `pgdata`, monta `docker/init-test-db.sql` que crea la base `licencias_test` de las pruebas e2e al crear el
  volumen) y `redis` (`redis:7-alpine`, puertos `6379`/`6380`). Ambos con `healthcheck`.
- **Perfil `app`** (opcional, imagen de producción): `migrate` (corre las migraciones y termina),
  `api` (`APP_ROLE=api`, puerto `3000:3000`, espera a que `migrate` termine con éxito y a que `redis` esté sano) y
  `worker` (`APP_ROLE=worker`, mismas dependencias, sin healthcheck HTTP — el worker no expone HTTP).
- Advertencia documentada en el propio archivo: `docker compose --profile app down` también detiene/elimina
  `postgres` y `redis`, porque esos dos no declaran `profiles:` y Compose los trata como "siempre habilitados"
  (unión con el perfil `app`). Para bajar solo `migrate`/`api`/`worker`:
  `docker compose --profile app down migrate api worker` o
  `docker compose stop migrate api worker && docker compose rm -f migrate api worker`.

## `fly.toml` (borrador, Sprint 4)

- `[build]`: usa el mismo `Dockerfile`.
- `[deploy].release_command = "node dist/database/run-migrations.js"`: corre las migraciones en una máquina
  temporal antes de cada despliegue.
- `[processes]`: `app = "node dist/main.js"`, `worker = "node dist/worker.js"` (los dos process groups de Fly).
- `[http_service]`: `internal_port = 3000`, `force_https = true`, solo el process group `app`; health check
  `GET /health` cada 30 s con 20 s de gracia.
- Comentario en el archivo: secretos a definir con `fly secrets set` — `DATABASE_URL` (+`DB_SSL=true`),
  `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_PEPPER`, `LICENSE_ENC_KEY`, `CORS_ORIGIN`. `APP_ROLE` no hace falta: en
  producción el default ya es `api`, y el process group `worker` usa su propio entrypoint (`dist/worker.js`).
- `app`/`primary_region` siguen como placeholders (`[nombre-de-la-app-en-fly]` / `[región]`): completar antes de
  `fly launch`.

## Qué falta para Sprint 4

- Despliegue real (`fly launch`/`fly deploy`), nombre de app y región definitivos.
- CI en GitHub Actions (typecheck + unit + e2e con servicios Postgres/Redis) — hoy no existe ningún workflow.
- Bull Board (panel de colas) y Sentry (reporte de errores) — fuera de alcance de Fundaciones.
- Alertas (cola de fallidos, stock bajo, pagos esperando) y el job `low-stock-check`.
- Probar el `release_command` y el health check contra un despliegue real en Fly.io (hoy solo se validó
  `docker compose --profile app up`, local).
