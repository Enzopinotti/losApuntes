import { MongoAccountExportOrphanCleanupStore } from './mongo-account-export-orphan-cleanup.store';
import { AccountExportOrphanCleanupSchema } from './account-export-orphan-cleanup.schema';
import {
  accountExportOrphanClaimDueOnMongoServer,
  accountExportOrphanOwnedAndDueOnMongoServer,
} from '../domain/account-export-mongo-claim-clock';

const jobId = '11111111-1111-4111-8111-111111111111';
const generation = '22222222-2222-4222-8222-222222222222';
const claimId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-10-15T12:00:00.000Z');

function fixture() {
  const upsert = { exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };
  const claim = {
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue({
      jobId,
      generation,
      ownerUserId: 'owner-a',
      claimId,
      attempts: 1,
    }),
  };
  const remove = { exec: jest.fn().mockResolvedValue({ deletedCount: 1 }) };
  const retry = {
    exec: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
  };
  const model = {
    updateOne: jest.fn().mockReturnValueOnce(upsert).mockReturnValue(retry),
    findOneAndUpdate: jest.fn().mockReturnValue(claim),
    deleteOne: jest.fn().mockReturnValue(remove),
  };
  return {
    model,
    upsert,
    claim,
    remove,
    retry,
    store: new MongoAccountExportOrphanCleanupStore(model as never),
  };
}

describe('B67 durable account export orphan cleanup', () => {
  it('has an immutable unique job/generation key and due-queue index', () => {
    const indexes = AccountExportOrphanCleanupSchema.indexes();
    expect(indexes).toContainEqual([
      { jobId: 1, generation: 1 },
      expect.objectContaining({ unique: true }),
    ]);
    expect(indexes.some(([keys]) => 'nextAttemptAt' in keys)).toBe(true);
  });

  it('enqueues idempotently without overwriting a claim or resetting attempts', async () => {
    const f = fixture();
    await f.store.enqueue({ jobId, ownerUserId: 'owner-a', generation, now });
    expect(f.model.updateOne).toHaveBeenCalledWith(
      { jobId, generation },
      {
        $setOnInsert: {
          jobId,
          ownerUserId: 'owner-a',
          generation,
          state: 'pending',
          attempts: 0,
          nextAttemptAt: now,
          claimId: null,
          leaseExpiresAt: null,
        },
      },
      { upsert: true },
    );
    f.upsert.exec.mockRejectedValueOnce({ code: 11000 });
    f.model.updateOne.mockReturnValueOnce(f.upsert);
    await expect(
      f.store.enqueue({
        jobId,
        ownerUserId: 'owner-a',
        generation,
        now,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects invalid or attacker-supplied object key fragments', async () => {
    const f = fixture();
    for (const value of ['', '../outside', 'not-a-uuid']) {
      await expect(
        f.store.enqueue({
          jobId,
          ownerUserId: 'owner-a',
          generation: value,
          now,
        }),
      ).rejects.toThrow('invalid');
    }
    expect(f.model.updateOne).not.toHaveBeenCalled();
  });

  it('B69 clears only an unclaimed pending intent after successful S3 deletion', async () => {
    const f = fixture();
    await expect(f.store.clearPending({ jobId, generation })).resolves.toBe(
      true,
    );
    expect(f.model.deleteOne).toHaveBeenCalledWith({
      jobId,
      generation,
      state: 'pending',
      claimId: null,
      verificationUntil: null,
    });
  });

  it("B69 cannot cancel another worker's processing claim", async () => {
    const f = fixture();
    f.remove.exec.mockResolvedValueOnce({ deletedCount: 0 });
    await expect(f.store.clearPending({ jobId, generation })).resolves.toBe(
      false,
    );
    expect(f.model.deleteOne).toHaveBeenCalledWith({
      jobId,
      generation,
      state: 'pending',
      claimId: null,
      verificationUntil: null,
    });
  });

  it('claims pending work or an expired worker lease using one CAS', async () => {
    const f = fixture();
    const until = new Date(now.getTime() + 120_000);
    await expect(
      f.store.claimNext({ now, claimId, leaseExpiresAt: until }),
    ).resolves.toMatchObject({ jobId, generation, attempts: 1 });
    expect(f.model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        $or: [
          { state: 'pending', nextAttemptAt: { $lte: now } },
          {
            state: 'processing',
            leaseExpiresAt: { $lte: now },
            nextAttemptAt: { $lte: now },
          },
        ],
        ...accountExportOrphanClaimDueOnMongoServer(),
      },
      {
        $set: {
          state: 'processing',
          claimId,
          leaseExpiresAt: until,
        },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { nextAttemptAt: 1, createdAt: 1, jobId: 1 } },
    );
  });

  it('B77 rejects a reclaimed processing task until both lease and settle dates are due', async () => {
    const f = fixture();
    const until = new Date(now.getTime() + 120_000);
    await f.store.claimNext({ now, claimId, leaseExpiresAt: until });
    expect(f.model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        $or: [
          { state: 'pending', nextAttemptAt: { $lte: now } },
          {
            state: 'processing',
            leaseExpiresAt: { $lte: now },
            nextAttemptAt: { $lte: now },
          },
        ],
        ...accountExportOrphanClaimDueOnMongoServer(),
      },
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('B84 candidate selection demands Mongo primary due and expiry, not only an ahead worker clock', async () => {
    const f = fixture();
    await f.store.claimNext({
      now: new Date(now.getTime() + 3_600_000),
      claimId,
      leaseExpiresAt: new Date(now.getTime() + 3_720_000),
    });
    expect(f.model.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining(accountExportOrphanClaimDueOnMongoServer()),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('B84 queue settlement and ACK share the exact server-clock ownership predicate', async () => {
    const f = fixture();
    await f.store.enqueue({ jobId, ownerUserId: 'owner-a', generation, now });
    await f.store.renewLease({
      jobId,
      generation,
      claimId,
      now,
      leaseExpiresAt: new Date(now.getTime() + 120_000),
    });
    await f.store.acknowledge({ jobId, generation, claimId, now });
    await f.store.retry({
      jobId,
      generation,
      claimId,
      now,
      nextAttemptAt: new Date(now.getTime() + 60_000),
    });
    const required = accountExportOrphanOwnedAndDueOnMongoServer();
    const updateCalls = f.model.updateOne.mock.calls as unknown[][];
    const deleteCalls = f.model.deleteOne.mock.calls as unknown[][];
    expect(updateCalls[0]?.[0]).not.toHaveProperty('$expr');
    expect(updateCalls[1]?.[0]).toEqual(
      expect.objectContaining(required),
    );
    expect(deleteCalls[0]?.[0]).toEqual(
      expect.objectContaining(required),
    );
    expect(updateCalls[2]?.[0]).toEqual(
      expect.objectContaining(required),
    );
  });

  it('B77 lease renewal requires the claimant’s exact verification horizon', async () => {
    const f = fixture();
    const until = new Date(now.getTime() + 60 * 60_000);
    await f.store.enqueue({ jobId, ownerUserId: 'owner-a', generation, now });
    await f.store.renewLease({
      jobId,
      generation,
      claimId,
      now,
      leaseExpiresAt: new Date(now.getTime() + 120_000),
      verificationUntil: until,
    });
    expect(f.model.updateOne).toHaveBeenLastCalledWith(
      {
        jobId,
        generation,
        state: 'processing',
        claimId,
        leaseExpiresAt: { $gt: now },
        verificationUntil: until,
        ...accountExportOrphanOwnedAndDueOnMongoServer(),
      },
      { $max: { leaseExpiresAt: new Date(now.getTime() + 120_000) } },
    );
  });

  it('B77 fails a stale deadline on retry rather than shortening a takeover delay', async () => {
    const f = fixture();
    const until = new Date(now.getTime() + 60 * 60_000);
    const due = new Date(now.getTime() + 10 * 60_000);
    await f.store.enqueue({ jobId, ownerUserId: 'owner-a', generation, now });
    f.retry.exec.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    await expect(
      f.store.retry({
        jobId,
        generation,
        claimId,
        now,
        nextAttemptAt: due,
        verificationUntil: until,
      }),
    ).resolves.toBe(false);
    expect(f.model.updateOne).toHaveBeenLastCalledWith(
      {
        jobId,
        generation,
        state: 'processing',
        claimId,
        leaseExpiresAt: { $gt: now },
        verificationUntil: until,
        ...accountExportOrphanOwnedAndDueOnMongoServer(),
      },
      {
        $set: { state: 'pending', claimId: null, leaseExpiresAt: null },
        $max: { nextAttemptAt: due },
      },
    );
  });

  it('B68 renews only its own active claim using a monotonic max lease', async () => {
    const f = fixture();
    await f.store.enqueue({ jobId, ownerUserId: 'owner-a', generation, now });
    const expires = new Date(now.getTime() + 180_000);
    await expect(
      f.store.renewLease({
        jobId,
        generation,
        claimId,
        now,
        leaseExpiresAt: expires,
      }),
    ).resolves.toBe(true);
    expect(f.model.updateOne).toHaveBeenLastCalledWith(
      {
        jobId,
        generation,
        state: 'processing',
        claimId,
        leaseExpiresAt: { $gt: now },
        verificationUntil: null,
        ...accountExportOrphanOwnedAndDueOnMongoServer(),
      },
      { $max: { leaseExpiresAt: expires } },
    );
  });

  it('B68 refuses to renew a stolen or expired cleanup claim', async () => {
    const f = fixture();
    await f.store.enqueue({ jobId, ownerUserId: 'owner-a', generation, now });
    f.retry.exec.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    await expect(
      f.store.renewLease({
        jobId,
        generation,
        claimId: 'stolen-claim',
        now,
        leaseExpiresAt: new Date(now.getTime() + 120_000),
      }),
    ).resolves.toBe(false);
  });

  it('acknowledges deletion using exact generation, claim and unexpired lease', async () => {
    const f = fixture();
    await expect(
      f.store.acknowledge({ jobId, generation, claimId, now }),
    ).resolves.toBe(true);
    expect(f.model.deleteOne).toHaveBeenCalledWith({
      jobId,
      generation,
      state: 'processing',
      claimId,
      leaseExpiresAt: { $gt: now },
      verificationUntil: null,
      ...accountExportOrphanOwnedAndDueOnMongoServer(),
    });
    f.remove.exec.mockResolvedValueOnce({ deletedCount: 0 });
    await expect(
      f.store.acknowledge({ jobId, generation, claimId, now }),
    ).resolves.toBe(false);
  });

  it('B75 CAS-fences ACK to the verification deadline observed by the claimant', async () => {
    const f = fixture();
    const until = new Date(now.getTime() + 60 * 60_000);
    await expect(
      f.store.acknowledge({
        jobId,
        generation,
        claimId,
        now,
        verificationUntil: until,
      }),
    ).resolves.toBe(true);
    expect(f.model.deleteOne).toHaveBeenCalledWith({
      jobId,
      generation,
      state: 'processing',
      claimId,
      leaseExpiresAt: { $gt: now },
      verificationUntil: until,
      ...accountExportOrphanOwnedAndDueOnMongoServer(),
    });
  });

  it('schedules bounded retry without resetting generation or attempts', async () => {
    const f = fixture();
    const later = new Date(now.getTime() + 60_000);
    await expect(
      f.store.retry({
        jobId,
        generation,
        claimId,
        now,
        nextAttemptAt: later,
      }),
    ).resolves.toBe(true);
    expect(f.model.updateOne).toHaveBeenLastCalledWith(
      {
        jobId,
        generation,
        state: 'processing',
        claimId,
        leaseExpiresAt: { $gt: now },
        verificationUntil: null,
        ...accountExportOrphanOwnedAndDueOnMongoServer(),
      },
      {
        $set: {
          state: 'pending',
          claimId: null,
          leaseExpiresAt: null,
        },
        $max: { nextAttemptAt: later },
      },
    );
  });
});
