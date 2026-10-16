import { setTimeout as delay } from 'node:timers/promises';

/**
 * B79: private counters only. Never include job IDs, owner IDs, object keys,
 * tokens or storage responses in worker logs.
 */
export interface AccountExportOrphanEnqueueMetrics {
  orphanEnqueueRetries: number;
  orphanEnqueueRecovered: number;
  orphanEnqueueFailures: number;
}

const ENQUEUE_ATTEMPT_DELAYS_MS = [0, 50, 100] as const;

/**
 * Enqueue only a generation already proven non-publishable by the caller.
 * This bounded local retry handles short Mongo interruptions, without granting
 * S3 DELETE authority. A durable Mongo intent or bucket lifecycle remains
 * necessary for recovery after all three attempts fail.
 *
 * The injected wait is only used by deterministic tests; production uses
 * node:timers/promises. Do not pass an object-storage operation as enqueue.
 */
export async function enqueueAccountExportOrphanWithRetry(
  enqueue: () => Promise<void>,
  metrics: AccountExportOrphanEnqueueMetrics,
  wait: (milliseconds: number) => Promise<void> = async (milliseconds) => {
    await delay(milliseconds);
  },
): Promise<boolean> {
  for (const [attempt, waitMs] of ENQUEUE_ATTEMPT_DELAYS_MS.entries()) {
    if (attempt > 0) {
      metrics.orphanEnqueueRetries += 1;
      await wait(waitMs);
    }
    try {
      await enqueue();
      if (attempt > 0) metrics.orphanEnqueueRecovered += 1;
      return true;
    } catch {
      // No secret-bearing error messages or S3 fallback; retry is bounded.
    }
  }

  metrics.orphanEnqueueFailures += 1;
  return false;
}
