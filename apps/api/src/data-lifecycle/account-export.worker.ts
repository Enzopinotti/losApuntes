import { NestFactory } from '@nestjs/core';
import { setTimeout as delay } from 'node:timers/promises';

import { AppModule } from '../app.module';
import { AccountExportProcessor } from './domain/account-export-processor';

const DEFAULT_INTERVAL_MS = 5_000;
const MAX_JOBS_PER_ITERATION = 5;

function intervalMs(): number {
  const raw = process.env.ACCOUNT_EXPORT_WORKER_INTERVAL_MS?.trim();
  if (!raw) return DEFAULT_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1_000 || parsed > 60 * 60_000) {
    throw new Error(
      'ACCOUNT_EXPORT_WORKER_INTERVAL_MS must be an integer between 1000 and 3600000',
    );
  }
  return parsed;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const processor = app.get(AccountExportProcessor);
  const waitMs = intervalMs();
  const shutdown = new AbortController();
  let stopping = false;
  const stop = () => {
    stopping = true;
    shutdown.abort();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    while (!stopping) {
      try {
        const iteration = await processor.runIteration(MAX_JOBS_PER_ITERATION);
        if (
          iteration.claimed > 0 ||
          iteration.expiredDeleted > 0 ||
          iteration.expiredRetired > 0 ||
          iteration.expirationStale > 0 ||
          iteration.expirationRetries > 0 ||
          iteration.orphanDeleted > 0 ||
          iteration.orphanVerificationScheduled > 0 ||
          iteration.orphanPreserved > 0 ||
          iteration.orphanRetries > 0 ||
          iteration.orphanAuthorityBlocked > 0 ||
          iteration.orphanEnqueueRetries > 0 ||
          iteration.orphanEnqueueFailures > 0
        ) {
          console.log(
            JSON.stringify({
              event: 'account_export.worker.iteration',
              ...iteration,
            }),
          );
        }
        if (iteration.orphanEnqueueFailures > 0) {
          // Alert without job IDs, owners, object keys or provider errors.
          console.warn(
            JSON.stringify({
              event: 'account_export.worker.orphan_enqueue_failed',
              failedCount: iteration.orphanEnqueueFailures,
              retryCount: iteration.orphanEnqueueRetries,
            }),
          );
        }
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: 'account_export.worker.iteration_failed',
            errorType: error instanceof Error ? error.name : 'UnknownError',
          }),
        );
      }

      try {
        await delay(waitMs, undefined, {
          ref: false,
          signal: shutdown.signal,
        });
      } catch {
        if (!stopping) throw new Error('Account export worker delay failed');
      }
    }
  } finally {
    await app.close();
  }
}

void bootstrap().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'account_export.worker.failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 1;
});
