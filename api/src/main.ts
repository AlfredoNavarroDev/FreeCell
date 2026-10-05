import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3001').split(',') });
  app.enableShutdownHooks(); // cierra bien las conexiones de Redis y Postgres
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
