import { ForbiddenException } from '@nestjs/common';
import { MongoStudyCollectionStore } from './mongo-study-collection.store';

const owner = '507f1f77bcf86cd799439011';
const input = {
  id: '11111111-1111-4111-8111-111111111111',
  ownerUserId: owner,
  operationKey: '22222222-2222-4222-8222-222222222222',
  title: 'Álgebra',
  description: null,
};
function makeQuery(value: unknown) {
  return {
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}
function fixture(active: boolean) {
  const session = {
    withTransaction: jest.fn(async (callback: () => Promise<void>) =>
      callback(),
    ),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  const connection = {
    startSession: jest.fn().mockResolvedValue(session),
  };
  const users = {
    findOneAndUpdate: jest
      .fn()
      .mockReturnValue(makeQuery(active ? { _id: owner } : null)),
  };
  const collections = {
    findOne: jest.fn().mockReturnValue({
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        ...input,
        resourceIds: [],
        revision: 1,
      }),
    }),
    deleteOne: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    }),
    findOneAndUpdate: jest.fn().mockReturnValue(
      makeQuery({
        ...input,
        resourceIds: [],
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
  };
  const store = new MongoStudyCollectionStore(
    collections as never,
    connection as never,
    users as never,
  );
  return { store, users, collections, connection, session };
}
describe('MongoStudyCollectionStore closure serialization', () => {
  it('touches the owner lifecycle revision in the same transaction as upsert', async () => {
    const f = fixture(true);
    await expect(f.store.create(input)).resolves.toMatchObject({
      ownerUserId: owner,
      operationKey: input.operationKey,
    });
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
    expect(f.collections.findOneAndUpdate).toHaveBeenCalledWith(
      { ownerUserId: owner, operationKey: input.operationKey },
      { $setOnInsert: { ...input, resourceIds: [], revision: 1 } },
      { upsert: true, new: true, session: f.session },
    );
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });
  it('rejects a closed account before writing even if an old session reached the store', async () => {
    const f = fixture(false);
    await expect(f.store.create(input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(f.collections.findOneAndUpdate).not.toHaveBeenCalled();
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });
  const operations = [
    {
      label: 'edit collection',
      run: (f: ReturnType<typeof fixture>) =>
        f.store.updateOwned({
          id: input.id,
          ownerUserId: owner,
          expectedRevision: 1,
          patch: { title: 'Actualizado' },
        }),
    },
    {
      label: 'add resource',
      run: (f: ReturnType<typeof fixture>) =>
        f.store.addResource(
          input.id,
          owner,
          '33333333-3333-4333-8333-333333333333',
        ),
    },
    {
      label: 'remove resource',
      run: (f: ReturnType<typeof fixture>) =>
        f.store.removeResource(
          input.id,
          owner,
          '33333333-3333-4333-8333-333333333333',
        ),
    },
    {
      label: 'delete collection',
      run: (f: ReturnType<typeof fixture>) =>
        f.store.deleteOwned(input.id, owner),
    },
  ];

  it.each(operations)(
    'rejects $label for a closed owner before any private Mongo write',
    async ({ run }) => {
      const f = fixture(false);
      await expect(run(f)).rejects.toMatchObject({
        response: { code: 'STUDY_COLLECTION_ACCOUNT_INACTIVE' },
      });
      expect(f.users.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(f.collections.findOneAndUpdate).not.toHaveBeenCalled();
      expect(f.collections.deleteOne).not.toHaveBeenCalled();
      expect(f.collections.findOne).not.toHaveBeenCalled();
      expect(f.session.withTransaction).toHaveBeenCalledTimes(1);
      expect(f.session.endSession).toHaveBeenCalledTimes(1);
    },
  );

  it.each(operations)(
    'serializes $label via the same owner-revision write and session',
    async ({ run }) => {
      const f = fixture(true);
      await run(f);
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
      if (f.collections.deleteOne.mock.calls.length) {
        expect(f.collections.deleteOne).toHaveBeenCalledWith(
          { id: input.id, ownerUserId: owner },
          { session: f.session },
        );
      } else {
        const call: unknown[] = f.collections.findOneAndUpdate.mock.calls[0];
        expect(call[0]).toMatchObject({ id: input.id, ownerUserId: owner });
        expect(call[2]).toMatchObject({ new: true, session: f.session });
      }
      expect(f.session.withTransaction).toHaveBeenCalledTimes(1);
      expect(f.session.endSession).toHaveBeenCalledTimes(1);
    },
  );

  it('reads add/remove idempotent fallbacks inside the same session', async () => {
    const resourceId = '33333333-3333-4333-8333-333333333333';
    for (const operation of ['add', 'remove'] as const) {
      const f = fixture(true);
      f.collections.findOneAndUpdate.mockReturnValueOnce(makeQuery(null));
      if (operation === 'add') {
        await f.store.addResource(input.id, owner, resourceId);
      } else {
        await f.store.removeResource(input.id, owner, resourceId);
      }
      expect(f.collections.findOne).toHaveBeenCalledWith({
        id: input.id,
        ownerUserId: owner,
      });
      const query = f.collections.findOne.mock.results[0]?.value as {
        session: jest.Mock;
      };
      expect(query.session).toHaveBeenCalledWith(f.session);
      expect(f.session.endSession).toHaveBeenCalledTimes(1);
    }
  });

  it('adds a revision predicate inside the same Mongo transaction for recovery removal', async () => {
    const f = fixture(true);
    const id = '33333333-3333-4333-8333-333333333333';
    await f.store.removeResource(input.id, owner, id, 7);
    expect(f.collections.findOneAndUpdate).toHaveBeenCalledWith(
      { id: input.id, ownerUserId: owner, resourceIds: id, revision: 7 },
      { $pull: { resourceIds: id }, $inc: { revision: 1 } },
      { new: true, session: f.session },
    );
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the conditional predicate did not match', async () => {
    const f = fixture(true);
    f.collections.findOneAndUpdate.mockReturnValueOnce(makeQuery(null));
    await expect(
      f.store.removeResource(
        input.id,
        owner,
        '33333333-3333-4333-8333-333333333333',
        7,
      ),
    ).rejects.toMatchObject({
      response: { code: 'STUDY_COLLECTION_REVISION_CONFLICT' },
    });
    expect(f.collections.findOne).not.toHaveBeenCalled();
    expect(f.collections.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('closes the session when Mongo rejects a private collection write', async () => {
    const f = fixture(true);
    const failure = new Error('write conflict');
    f.collections.findOneAndUpdate.mockReturnValueOnce({
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockRejectedValue(failure),
    });
    await expect(
      f.store.updateOwned({
        id: input.id,
        ownerUserId: owner,
        expectedRevision: 1,
        patch: { title: 'New' },
      }),
    ).rejects.toBe(failure);
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });
});
