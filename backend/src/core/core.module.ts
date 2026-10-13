import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../common/crypto/crypto.module';
import { buildDataSourceOptions } from '../database/data-source-options';
import { EnvironmentVariables, validateEnv } from './config/env.validation';
import { parseRedisUrl, RedisModule } from './redis/redis.module';

/** Nunca se registran credenciales, tokens ni claves (regla 4). */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.refreshToken',
  '*.accessToken',
  '*.secret',
];

/** Propaga X-Request-Id si llega (máx. 100 caracteres) o genera uno, y lo devuelve en la respuesta. */
function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' &&
    incoming.length > 0 &&
    incoming.length <= 100
      ? incoming
      : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/** Infraestructura compartida por la API y el worker. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: requestId,
          redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
          autoLogging: {
            ignore: (req: IncomingMessage) =>
              (req.url ?? '').startsWith('/health'),
          },
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        buildDataSourceOptions({
          DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
          DB_SSL: config.get('DB_SSL', { infer: true }),
        }),
    }),
    RedisModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        connection: parseRedisUrl(config.get('REDIS_URL', { infer: true })),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      }),
    }),
    CryptoModule,
    AuditModule,
  ],
})
export class CoreModule {}
