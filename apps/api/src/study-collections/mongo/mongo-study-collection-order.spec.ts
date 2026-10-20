import { ForbiddenException } from '@nestjs/common';

import { MongoStudyCollectionStore } from './mongo-study-collection.store';

const owner = '507f1f77bcf86cd799439011';
const collectionId = '11111111-1111-4111-8111-111111111111';
const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';

function fixture(active: boolean, outcome: unknown) {
  const session = {
    withTransaction: jest.fn(async (callback: () => Promise<void>) =>
      callback(),
    ),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  const connection = { startSession: jest.fn().mockResolvedValue(session) };
  const users = {
    findOneAndUpdate: jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(active ? { _id: owner } : null),
      }),
    }),
  };
  const exec = jest.fn().mockResolvedValue(outcome);
  const lean = jest.fn().mockReturnValue({ exec });
  const findOneAndUpdate = jest.fn().mockReturnValue({ lean });
  const store = new MongoStudyCollectionStore(
    { findOneAndUpdate } as never,
    connection as never,
    users as never,
  );
  return { store, session, users, findOneAndUpdate, exec };
}

function mutation() {
  return {
    id: collectionId,
    ownerUserId: owner,
    expectedRevision: 4,
    originalResourceIds: [first, second],
    orderedResourceIds: [second, first],
  };
}

describe('B153 Mongo collection order lifecycle and compare-and-swap', () => {
  it('performs exactly one revision and order mutation in an active-owner transaction', async () => {
    const after = {
      ...mutation(),
      resourceIds: [second, first],
      revision: 5,
      updatedAt: new Date('2026-10-20T12:00:00.000Z'),
    };
    const f = fixture(true, after);
    await expect(f.store.reorderResources(mutation())).resolves.toBe(after);
    expect(f.users.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: owner,
        $or: [
          { account_status: 'active' },
          { account_status: { $exists: false } },
        ],
      },
      { $inc: { account_lifecycle_revision: 1 } },
      { new: false, session: f.session },
    );
    expect(f.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(f.findOneAndUpdate).toHaveBeenCalledWith(
      {
        id: collectionId,
        ownerUserId: owner,
        revision: 4,
        resourceIds: [first, second],
      },
      {
        $set: { resourceIds: [second, first] },
        $inc: { revision: 1 },
      },
      { new: true, session: f.session },
    );
    expect(f.session.withTransaction).toHaveBeenCalledTimes(1);
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('aborts before commit when Mongo returns a corrupted post-write row', async () => {
    const f = fixture(true, {
      id: collectionId,
      ownerUserId: owner,
      resourceIds: [first, second],
      revision: 5,
      updatedAt: new Date('2026-10-20T12:00:00.000Z'),
    });
    await expect(f.store.reorderResources(mutation())).rejects.toMatchObject({
      response: { code: 'STUDY_COLLECTION_ORDER_DATA_INVALID' },
    });
    expect(f.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('rejects inactive owners without issuing a collection write', async () => {
    const f = fixture(false, null);
    await expect(f.store.reorderResources(mutation())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(f.findOneAndUpdate).not.toHaveBeenCalled();
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('leaves concurrency decisions to the owner-scoped CAS and never retries without revision', async () => {
    const f = fixture(true, null);
    await expect(f.store.reorderResources(mutation())).resolves.toBeNull();
    expect(f.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('propagates transient and permanent Mongo failures rather than claiming success', async () => {
    const f = fixture(true, null);
    f.exec.mockRejectedValue(new Error('mongo-unavailable'));
    await expect(f.store.reorderResources(mutation())).rejects.toThrow(
      'mongo-unavailable',
    );
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });
});
