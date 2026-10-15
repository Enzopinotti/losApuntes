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
    withTransaction: jest.fn(async (callback: () => Promise<void>) => callback()),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  const connection = {
    startSession: jest.fn().mockResolvedValue(session),
  };
  const users = {
    findOneAndUpdate: jest.fn().mockReturnValue(
      makeQuery(active ? { _id: owner } : null),
    ),
  };
  const collections = {
    findOneAndUpdate: jest.fn().mockReturnValue(
      makeQuery({
        ...input, resourceIds: [], revision: 1,
        createdAt: new Date(), updatedAt: new Date(),
      }),
    ),
  };
  const store = new MongoStudyCollectionStore(
    collections as never, connection as never, users as never,
  );
  return { store, users, collections, connection, session };
}
describe('MongoStudyCollectionStore closure serialization', () => {
  it('touches the owner lifecycle revision in the same transaction as upsert', async () => {
    const f = fixture(true);
    await expect(f.store.create(input)).resolves.toMatchObject({
      ownerUserId: owner, operationKey: input.operationKey,
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
    await expect(f.store.create(input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.collections.findOneAndUpdate).not.toHaveBeenCalled();
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });
});
