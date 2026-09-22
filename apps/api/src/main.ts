import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 4000;

  const config = new DocumentBuilder()
    .setTitle('Los Apuntes API')
    .setDescription('API de Los Apuntes')
    .setVersion('0.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(port);
  console.log(`Los Apuntes API listening on port ${port}`);
}

void bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap Los Apuntes API', error);
  process.exitCode = 1;
});
