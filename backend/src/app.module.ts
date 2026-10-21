import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CatalogModule } from './catalog/catalog.module';
import { CoreModule } from './core/core.module';
import type { EnvironmentVariables } from './core/config/env.validation';
import { REDIS_CLIENT } from './core/redis/redis.module';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { WorkersModule } from './workers.module';

/**
 * Se evalúa al cargar el módulo; main.ts carga .env antes (import 'dotenv/config').
 * En desarrollo (`all`) los processors corren dentro de la API; en producción, en su propio proceso.
 */
function runWorkersInApi(): boolean {
  const role =
    process.env.APP_ROLE ??
    (process.env.NODE_ENV === 'production' ? 'api' : 'all');
  return role === 'all';
}

@Module({
  imports: [
    CoreModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT, ConfigService],
      useFactory: (
        redis: Redis,
        config: ConfigService<EnvironmentVariables, true>,
      ) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        // Contadores en Redis: el límite se comparte entre todas las máquinas de la API.
        storage: new ThrottlerStorageRedisService(redis),
        errorMessage: 'Demasiados intentos, espera un momento',
        // Se lee en cada request (no en el factory) para que las pruebas puedan activarlo solo
        // donde lo verifican; se consulta el valor ya validado por ConfigService, no process.env
        // directo, para que coincida con la validación de THROTTLE_ENABLED en env.validation.ts.
        skipIf: () => !config.get('THROTTLE_ENABLED', { infer: true }),
      }),
    }),
    HealthModule,
    AuthModule,
    CatalogModule,
    PaymentMethodsModule,
    OrdersModule,
    ...(runWorkersInApi() ? [WorkersModule] : []),
  ],
  providers: [
    // Orden: rate limit → sesión → rol.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
