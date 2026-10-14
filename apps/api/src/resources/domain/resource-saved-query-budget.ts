import { RequestTimeoutException } from '@nestjs/common';

function isMongoBudgetExceeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; codeName?: unknown };
  return candidate.code === 50 || candidate.codeName === 'MaxTimeMSExpired';
}

/**
 * Resource search must fail closed when Mongo exceeds its execution budget.
 * Never return an empty authorized page or expose Mongo internals as a
 * successful search. Non-timeout errors retain their original behavior.
 */
export async function boundedSavedQuery<T>(
  execute: () => Promise<T>,
): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    if (isMongoBudgetExceeded(error)) {
      throw new RequestTimeoutException({
        code: 'RESOURCE_SAVED_QUERY_TIMEOUT',
        message: 'Saved library query timed out; retry with narrower filters',
      });
    }
    throw error;
  }
}
