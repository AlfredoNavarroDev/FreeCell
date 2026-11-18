import type { INestApplication, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { REDIS_CLIENT } from '../../src/core/redis/redis.module';
import { truncateAll } from './factories';

export interface TestAppOptions {
  /** Módulos extra (por ejemplo, NotificationsDeliveryModule). */
  imports?: Type[];
  /** Controladores solo de prueba (por ejemplo, una ruta protegida con @Roles). */
  controllers?: Type[];
  /** Para overrideProvider(...). */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  /**
   * Corre tras `configureApp` pero antes de `app.init()`. Un `app.use()` agregado después de
   * `init()` queda detrás del catch-all de Nest y nunca se alcanza (confirmado): todo middleware
   * extra (Bull Board, etc.) debe registrarse acá.
   */
  beforeInit?: (app: NestExpressApplication) => void;
}

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule, ...(options.imports ?? [])],
    controllers: options.controllers ?? [],
  });
  if (options.configure) {
    builder = options.configure(builder);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  options.beforeInit?.(app);
  await app.init();
  return app;
}

/** Base vacía y Redis /1 vacío (colas y contadores de rate limit incluidos). */
export async function resetState(app: INestApplication): Promise<void> {
  await truncateAll(app.get(DataSource));
  await app.get<Redis>(REDIS_CLIENT).flushdb();
}
