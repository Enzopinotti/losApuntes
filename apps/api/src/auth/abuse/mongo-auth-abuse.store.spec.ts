import type { Model } from 'mongoose';

import { MongoAuthAbuseStore } from './mongo-auth-abuse.store';
import type { AuthAbuseBucketDocument } from './schemas/auth-abuse-bucket.schema';

const INPUT = {
  bucketKey: 'a'.repeat(64),
  operation: 'password_login' as const,
  dimension: 'origin' as const,
  windowStartedAt: new Date('2026-09-24T12:00:00.000Z'),
  windowEndsAt: new Date('2026-09-24T12:10:00.000Z'),
  expiresAt: new Date('2026-09-24T12:15:00.000Z'),
};

function document(count: number) {
  return {
    ...INPUT,
    count,
  } as AuthAbuseBucketDocument;
}

describe('MongoAuthAbuseStore', () => {
  it('atomically increments or creates one window bucket', async () => {
    const exec = jest.fn().mockResolvedValue(document(1));
    const findOneAndUpdate = jest.fn().mockReturnValue({ exec });
    const model = {
      findOneAndUpdate,
    } as unknown as Model<AuthAbuseBucketDocument>;
    const store = new MongoAuthAbuseStore(model);

    await expect(store.consume(INPUT)).resolves.toMatchObject({
      bucketKey: INPUT.bucketKey,
      count: 1,
    });

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { bucketKey: INPUT.bucketKey },
      {
        $setOnInsert: {
          bucketKey: INPUT.bucketKey,
          operation: INPUT.operation,
          dimension: INPUT.dimension,
          windowStartedAt: INPUT.windowStartedAt,
          windowEndsAt: INPUT.windowEndsAt,
          expiresAt: INPUT.expiresAt,
        },
        $inc: { count: 1 },
      },
      { upsert: true, new: true },
    );
  });

  it('recovers a concurrent first-create duplicate by incrementing the winner', async () => {
    const firstExec = jest.fn().mockRejectedValue({ code: 11000 });
    const winnerExec = jest.fn().mockResolvedValue(document(2));
    const findOneAndUpdate = jest
      .fn()
      .mockReturnValueOnce({ exec: firstExec })
      .mockReturnValueOnce({ exec: winnerExec });
    const model = {
      findOneAndUpdate,
    } as unknown as Model<AuthAbuseBucketDocument>;
    const store = new MongoAuthAbuseStore(model);

    await expect(store.consume(INPUT)).resolves.toMatchObject({
      count: 2,
    });

    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { bucketKey: INPUT.bucketKey },
      { $inc: { count: 1 } },
      { new: true },
    );
  });

  it('fails if the concurrent winner disappears', async () => {
    const firstExec = jest.fn().mockRejectedValue({ code: 11000 });
    const winnerExec = jest.fn().mockResolvedValue(null);
    const findOneAndUpdate = jest
      .fn()
      .mockReturnValueOnce({ exec: firstExec })
      .mockReturnValueOnce({ exec: winnerExec });
    const model = {
      findOneAndUpdate,
    } as unknown as Model<AuthAbuseBucketDocument>;
    const store = new MongoAuthAbuseStore(model);

    await expect(store.consume(INPUT)).rejects.toThrow(
      'Auth abuse bucket race winner disappeared',
    );
  });

  it('propagates non-duplicate persistence failures', async () => {
    const failure = new Error('storage failed');
    const exec = jest.fn().mockRejectedValue(failure);
    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue({ exec }),
    } as unknown as Model<AuthAbuseBucketDocument>;
    const store = new MongoAuthAbuseStore(model);

    await expect(store.consume(INPUT)).rejects.toBe(failure);
  });
});
