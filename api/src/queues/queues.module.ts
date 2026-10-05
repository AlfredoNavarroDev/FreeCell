import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Convierte REDIS_URL (redis:// o rediss:// para Upstash/Redis Cloud) en opciones de conexión. */
export function parseRedisUrl(raw: string) {
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

/**
 * Conexión global a Redis. Cada módulo registra sus propias colas con
 * BullModule.registerQueue(...).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: parseRedisUrl(config.getOrThrow<string>('REDIS_URL')),
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 3_600, count: 1_000 },
          // Se conservan los fallidos para inspeccionarlos (Bull Board en el Sprint 4).
          removeOnFail: { count: 5_000 },
        },
      }),
    }),
  ],
})
export class QueuesModule {}
