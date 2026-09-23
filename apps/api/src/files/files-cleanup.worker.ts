import { NestFactory } from '@nestjs/core';
import { setTimeout as delay } from 'node:timers/promises';

import { AppModule } from '../app.module';
import { FileService } from './domain/file.service';

const INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 100;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const files = app.get(FileService);
  let stopping = false;

  const stop = () => {
    stopping = true;
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    while (!stopping) {
      const result = await files.cleanupExpiredAssets(BATCH_SIZE);
      if (result.reclaimed > 0) {
        console.log(
          JSON.stringify({
            event: 'files.cleanup.completed',
            examined: result.examined,
            reclaimed: result.reclaimed,
          }),
        );
      }

      await delay(INTERVAL_MS, undefined, { ref: false });
    }
  } finally {
    await app.close();
  }
}

void bootstrap().catch((error: unknown) => {
  console.error('files.cleanup.worker_failed', error);
  process.exitCode = 1;
});
