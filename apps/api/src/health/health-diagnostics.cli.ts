import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { HealthService } from './health.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const result = await app.get(HealthService).diagnostics();
    console.log(JSON.stringify(result));
    if (result.status === 'not_ready') {
      process.exitCode = 2;
    }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'health.diagnostics.failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 2;
});
