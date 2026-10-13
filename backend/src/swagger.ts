import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** OpenAPI en /docs. Solo fuera de producción (lo decide main.ts). */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Free Cell API')
    .setDescription('API de la tienda de licencias Free Cell')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, config),
  );
}
