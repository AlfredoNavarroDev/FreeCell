# Licencias API

Backend de la tienda de licencias: **NestJS 11 · PostgreSQL · TypeORM · BullMQ (Redis) · JWT**.

## Cómo levantarlo

```bash
# 1. Variables de entorno
cp .env.example .env
#    Genera la llave de cifrado y pégala en LICENSE_ENC_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
#    Cambia también JWT_SECRET, ADMIN_EMAIL y ADMIN_PASSWORD.

# 2. PostgreSQL y Redis
docker compose up -d

# 3. Dependencias, tablas y datos iniciales
npm install
npm run migration:run     # crea las tablas
npm run seed              # crea el usuario admin y un producto demo

# 4. Arrancar
npm run start:dev         # http://localhost:3000/health
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run start:dev` | Servidor con recarga automática |
| `npm test` | Pruebas unitarias (cifrado de claves) |
| `npm run test:e2e` | Pruebas de integración con Postgres y Redis reales |
| `npm run typecheck` | Verifica tipos sin compilar |
| `npm run migration:generate -- src/database/migrations/Nombre` | Genera una migración al cambiar entidades |
| `npm run migration:run` | Aplica las migraciones pendientes |
| `npm run seed` | Crea admin y producto demo (se puede repetir sin duplicar) |

Las pruebas e2e usan la base `licencias_test` y el Redis número 1, así no tocan tus datos de desarrollo.

## Endpoints del Sprint 1

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/health` | público | Estado del servicio |
| POST | `/auth/register` | público | Crea una cuenta de cliente y devuelve el token |
| POST | `/auth/login` | público | Devuelve el token (7 días) |
| GET | `/auth/me` | cliente | Perfil del usuario |
| POST | `/orders` | cliente | Crea un pedido y **reserva una licencia por 30 min** |

Para proteger rutas de admin: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`.

## Decisiones técnicas (para el README del portafolio y entrevistas)

**Reserva sin condiciones de carrera.** `OrdersService.reserve` bloquea la licencia con
`SELECT ... FOR UPDATE SKIP LOCKED` dentro de una transacción. Si dos clientes compran a la vez, cada uno
toma una licencia distinta o recibe "agotado"; nadie espera ni recibe la misma. La prueba e2e lanza
10 compras simultáneas contra 3 licencias y comprueba que exactamente 3 tienen éxito.

**Liberación automática con BullMQ.** Al reservar se programa un trabajo diferido (`release-<orderId>`).
Si a los 30 minutos el pedido sigue sin pago, se cancela y la licencia vuelve al stock. El trabajo es
**idempotente**: consulta el estado actual en la base antes de actuar, así que no libera pedidos que
ya subieron su comprobante.

**Doble seguro.** PostgreSQL es la fuente de verdad, no Redis. Un trabajo repetible (`sweep-expired`,
cada 5 min) libera reservas vencidas por si Redis perdió algún trabajo.

**Claves cifradas.** Cada licencia se guarda con AES-256-GCM; la llave está en `LICENSE_ENC_KEY`, fuera de
la base. Un hash SHA-256 aparte permite detectar duplicados al cargar stock sin guardar la clave en claro.

**Mensajes sin duplicar.** La cola `notifications` usa el `jobId` y la tabla `notification_logs` como huella:
si BullMQ reintenta un envío ya hecho, se omite.

## Versiones fijadas a propósito

Los paquetes `@nestjs/config`, `jwt`, `passport`, `bullmq` y `typeorm` están en sus versiones **CommonJS**
(4, 11, 11, 11 y 11). Las versiones 12 son solo ESM y no funcionan con la configuración estándar de Nest ni con Jest.
Si actualizas, hazlo con la migración a ESM completa.

## Producción (Fly.io + Neon)

- API, workers y Redis corren en **Fly.io** (instancia propia de Redis, sin límite de comandos).
- `DATABASE_URL` de Neon con `DB_SSL=true` y `DB_SYNC=false`; ejecuta `npm run migration:run` en cada despliegue.
- `CORS_ORIGIN` con la URL del frontend en Vercel.
- Genera valores nuevos de `JWT_SECRET` y `LICENSE_ENC_KEY`. **Si pierdes `LICENSE_ENC_KEY`, no podrás descifrar las licencias guardadas.**

## Plan de sprints

Ver `../docs/08-plan-de-sprints.md` (fuente de verdad, se actualiza ahí). Resumen: Sprint 1 hecho; Sprint 2 agrega
catálogo, carrito, CRUD de catálogo y NextAuth; Sprint 3 agrega operación (pagos, inventario, reclamos), soporte,
reseñas y reportes; Sprint 4 es robustez y despliegue.
