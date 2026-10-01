import { NestFactory } from '@nestjs/core';
import { setTimeout as delay } from 'node:timers/promises';

import { AppModule } from '../app.module';
import { HealthService } from '../health/health.service';
import { FileService } from './domain/file.service';
import {
  clearFilesWorkerHealth,
  filesWorkerHealthValidityMs,
  writeFilesWorkerHealth,
} from './files-worker-health';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;
const SCAN_BATCH_SIZE = 20;

function cleanupIntervalMs(): number {
  const raw = process.env.FILES_CLEANUP_INTERVAL_MS?.trim();
  if (!raw) return DEFAULT_INTERVAL_MS;

  const parsed = Number(raw);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1_000 ||
    parsed > 60 * 60 * 1000
  ) {
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
  const health = app.get(HealthService);
  const intervalMs = cleanupIntervalMs();
  const healthValidityMs = filesWorkerHealthValidityMs(intervalMs);
  let stopping = false;
  const shutdown = new AbortController();

  const stop = () => {
    stopping = true;
    shutdown.abort();
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await clearFilesWorkerHealth();

  try {
    while (!stopping) {
      try {
        const diagnostics = await health.diagnostics();
        const dependenciesReady = diagnostics.checks.every(
          (check) => check.status === 'ok',
        );

        if (!dependenciesReady) {
          await writeFilesWorkerHealth('not_ready', healthValidityMs);
          console.warn(
            JSON.stringify({
              event: 'files.worker.dependencies_unavailable',
              status: diagnostics.status,
            }),
          );
        } else {
          const scans = await files.processPendingScans(SCAN_BATCH_SIZE);
          const cleanup =
            await files.cleanupExpiredAssets(CLEANUP_BATCH_SIZE);
          const iterationReady =
            scans.retryScheduled === 0 && scans.failed === 0;

          await writeFilesWorkerHealth(
            iterationReady ? 'ready' : 'not_ready',
            healthValidityMs,
          );

          if (scans.examined > 0 || cleanup.reclaimed > 0) {
            console.log(
              JSON.stringify({
                event: 'files.worker.completed',
                scans: {
                  examined: scans.examined,
                  clean: scans.clean,
                  rejected: scans.rejected,
                  retryScheduled: scans.retryScheduled,
                  failed: scans.failed,
                  busy: scans.busy,
                },
                cleanup: {
                  examined: cleanup.examined,
                  reclaimed: cleanup.reclaimed,
                },
              }),
            );
          }
        }
      } catch (error) {
        await writeFilesWorkerHealth('not_ready', healthValidityMs).catch(
          () => undefined,
        );
        console.warn(
          JSON.stringify({
            event: 'files.worker.iteration_failed',
            errorType: error instanceof Error ? error.name : 'UnknownError',
          }),
        );
      }

      try {
        await delay(intervalMs, undefined, {
          ref: false,
          signal: shutdown.signal,
        });
      } catch (error) {
        if (!stopping) throw error;
      }
    }
  } finally {
    await clearFilesWorkerHealth().catch(() => undefined);
    await app.close();
  }
}

void bootstrap().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'files.worker.failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 1;
});
