import { RequestTimeoutException } from '@nestjs/common';

import { boundedSavedQuery } from './resource-saved-query-budget';

describe('saved query execution budgets', () => {
  it('preserves successful authorized results', async () => {
    await expect(
      boundedSavedQuery(() => Promise.resolve({ items: [1], hasMore: false })),
    ).resolves.toEqual({ items: [1], hasMore: false });
  });

  it('translates Mongo execution-budget errors to an explicit retryable timeout', async () => {
    for (const error of [
      { code: 50, message: 'Mongo query timed out' },
      { codeName: 'MaxTimeMSExpired', message: 'Mongo query timed out' },
    ]) {
      const run = boundedSavedQuery(() => Promise.reject(error));
      await expect(run).rejects.toBeInstanceOf(RequestTimeoutException);
      await expect(
        boundedSavedQuery(() => Promise.reject(error)),
      ).rejects.toMatchObject({
        response: {
          code: 'RESOURCE_SAVED_QUERY_TIMEOUT',
        },
      });
    }
  });

  it('never masks unrelated persistence failures or returns an empty page', async () => {
    const failure = new Error('database connection unavailable');
    await expect(
      boundedSavedQuery(() => Promise.reject(failure)),
    ).rejects.toBe(failure);
  });
});
