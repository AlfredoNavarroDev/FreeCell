import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { EnvironmentVariables } from '../config/env.validation';

/** Cliente ioredis para throttling y health. BullMQ abre sus propias conexiones. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Convierte REDIS_URL (redis:// o rediss://) en opciones de conexión para BullMQ. */
export function parseRedisUrl(raw: string) {
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        new Redis(config.get('REDIS_URL', { infer: true }), {
          maxRetriesPerRequest: 3,
        }),
    },
    RedisShutdown,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
