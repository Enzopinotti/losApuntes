import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import {
  configureHttpRuntime,
  createHttpAdapter,
} from './runtime/http-runtime';

function configureSwagger(
  app: NestFastifyApplication,
  config: ConfigService,
): void {
  if (!config.get<boolean>('SWAGGER_ENABLED')) {
    return;
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Los Apuntes API')
    .setDescription('API de Los Apuntes')
    .setVersion('0.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(
    app,
    swaggerConfig,
  );
  SwaggerModule.setup('api', app, document);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createHttpAdapter(),
  );

  const config = app.get(ConfigService);
  configureHttpRuntime(app, config);
  configureSwagger(app, config);

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port, '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap Los Apuntes API', {
    errorType:
      error instanceof Error ? error.name : 'UnknownError',
  });
  process.exitCode = 1;
});
