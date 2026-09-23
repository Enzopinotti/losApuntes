import { NestFactory } from '@nestjs/core';
import { setTimeout as delay } from 'node:timers/promises';

import { AppModule } from '../app.module';
import { FileService } from './domain/file.service';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 100;

function cleanupIntervalMs(): number {
  const raw = process.env.FILES_CLEANUP_INTERVAL_MS?.trim();
  if (!raw) return DEFAULT_INTERVAL_MS;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1_000 || parsed > 60 * 60 * 1000) {
    throw new Error(
      'FILES_CLEANUP_INTERVAL_MS must be an integer between 1000 and 3600000',
    );
  }

  return parsed;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const files = app.get(FileService);
  const intervalMs = cleanupIntervalMs();
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

      await delay(intervalMs, undefined, { ref: false });
    }
  } finally {
    await app.close();
  }
}

void bootstrap().catch((error: unknown) => {
  console.error('files.cleanup.worker_failed', error);
  process.exitCode = 1;
});
