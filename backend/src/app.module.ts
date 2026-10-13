import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CoreModule } from './core/core.module';
import { REDIS_CLIENT } from './core/redis/redis.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    CoreModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        // Contadores en Redis: el límite se comparte entre todas las máquinas de la API.
        storage: new ThrottlerStorageRedisService(redis),
        errorMessage: 'Demasiados intentos, espera un momento',
        // Se lee en cada request para que las pruebas puedan activarlo solo donde lo verifican.
        skipIf: () => process.env.THROTTLE_ENABLED === 'false',
      }),
    }),
    HealthModule,
    AuthModule,
  ],
  providers: [
    // Orden: rate limit → sesión → rol.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
