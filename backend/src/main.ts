import './instrument';
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import type { EnvironmentVariables } from './core/config/env.validation';
import { mountQueuesAdmin } from './queues-admin/queues-admin';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  // Debe ir antes de app.init()/listen(): un app.use() agregado después queda detrás del
  // catch-all de Nest y nunca se alcanza.
  mountQueuesAdmin(app);

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupSwagger(app);
  }
  await app.listen(config.get('PORT', { infer: true }));
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
