import type { Connection, Model } from 'mongoose';

import { Notification } from '../../notifications/mongo/notification.mongo-schema';
import { User } from '../../users/schemas/user.schema';
import { SocialParticipantInactiveError } from '../domain/social.store';
import type { ConnectionRecord, FollowRecord } from '../domain/social.types';
import { SocialConnection, SocialFollow } from './social.mongo-schemas';
import { MongoSocialStore } from './mongo-social.store';

const now = new Date('2026-10-10T12:00:00.000Z');

function query(value: unknown) {
  const chain = {
    session: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(value),
  };
  chain.session.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

function follow(): FollowRecord {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    followerUserId: 'user-a',
    followeeUserId: 'user-b',
    createdAt: now,
    updatedAt: now,
  };
}

function connection(
  status: ConnectionRecord['status'] = 'pending',
): ConnectionRecord {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    userLowId: 'user-a',
    userHighId: 'user-b',
    requestedByUserId: 'user-a',
    status,
    respondedAt: status === 'pending' ? null : now,
    createdAt: now,
    updatedAt: now,
  };
}

function fixture(
  input: {
    inactiveUserIds?: string[];
    followRows?: unknown[];
    connectionRows?: unknown[];
  } = {},
) {
  const session = {
    withTransaction: jest.fn(async (callback: () => Promise<void>) =>
      callback(),
    ),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  const connectionClient = {
    startSession: jest.fn().mockResolvedValue(session),
  };
  const followRows = [...(input.followRows ?? [])];
  const connectionRows = [...(input.connectionRows ?? [])];
  const follows = {
    findOne: jest.fn(() => query(followRows.shift() ?? null)),
    updateOne: jest.fn(() => ({
      exec: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
    })),
  };
  const connections = {
    findOne: jest.fn(() => query(connectionRows.shift() ?? null)),
    findOneAndUpdate: jest.fn(() => query(connection('pending'))),
    create: jest.fn().mockImplementation((rows: Array<{ id: string }>) =>
      Promise.resolve([
        {
          toObject: () => ({
            ...connection(),
            id: rows[0]?.id,
          }),
        },
      ]),
    ),
  };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };
  const inactiveUserIds = new Set(input.inactiveUserIds ?? []);
  const users = {
    findOneAndUpdate: jest.fn(
      (...args: [{ _id: string }, unknown, unknown]) => {
        const filter = args[0];
        return query(
          inactiveUserIds.has(filter._id) ? null : { _id: filter._id },
        );
      },
    ),
  };
  const store = new MongoSocialStore(
    connectionClient as unknown as Connection,
    follows as unknown as Model<SocialFollow>,
    connections as unknown as Model<SocialConnection>,
    notifications as unknown as Model<Notification>,
    users as unknown as Model<User>,
  );

  return {
    store,
    session,
    follows,
    connections,
    notifications,
    users,
  };
}

const followInput = {
  id: '22222222-2222-4222-8222-222222222222',
  followerUserId: 'user-a',
  followeeUserId: 'user-b',
  notification: {
    id: '44444444-4444-4444-8444-444444444444',
    userId: 'user-b',
    type: 'social.followed' as const,
    actorUserId: 'user-a',
    targetType: 'profile' as const,
    targetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    readAt: null,
  },
};

const connectionInput = {
  id: '33333333-3333-4333-8333-333333333333',
  requesterUserId: 'user-a',
  targetUserId: 'user-b',
  now,
  notification: {
    id: '55555555-5555-4555-8555-555555555555',
    userId: 'user-b',
    type: 'social.connection_requested' as const,
    actorUserId: 'user-a',
    targetType: 'connection' as const,
    targetId: '33333333-3333-4333-8333-333333333333',
    readAt: null,
  },
};

describe('MongoSocialStore active target fence', () => {
  it('creates a Follow only after fencing an active or legacy User in the same transaction', async () => {
    const row = follow();
    const f = fixture({ followRows: [null, row] });

    const result = await f.store.follow(followInput);

    expect(result).toEqual({ follow: row, created: true });
    expect(
      f.users.findOneAndUpdate.mock.calls.map(([filter]) => filter._id),
    ).toEqual(['user-a', 'user-b']);
    for (const [filter, update, options] of f.users.findOneAndUpdate.mock
      .calls) {
      expect(filter).toEqual({
        _id: filter._id,
        $or: [
          { account_status: 'active' },
          { account_status: { $exists: false } },
        ],
      });
      expect(update).toEqual({ $inc: { account_lifecycle_revision: 1 } });
      expect(options).toEqual({ new: false, session: f.session });
    }
    expect(f.follows.updateOne).toHaveBeenCalledWith(
      { followerUserId: 'user-a', followeeUserId: 'user-b' },
      {
        $setOnInsert: {
          id: followInput.id,
          followerUserId: 'user-a',
          followeeUserId: 'user-b',
        },
      },
      { upsert: true, session: f.session },
    );
    expect(f.notifications.create).toHaveBeenCalledWith(
      [followInput.notification],
      { session: f.session },
    );
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('allows an existing Follow to be read idempotently after its target closes', async () => {
    const row = follow();
    const f = fixture({ inactiveUserIds: ['user-b'], followRows: [row] });

    await expect(f.store.follow(followInput)).resolves.toEqual({
      follow: row,
      created: false,
    });
    expect(f.users.findOneAndUpdate).not.toHaveBeenCalled();
    expect(f.follows.updateOne).not.toHaveBeenCalled();
    expect(f.notifications.create).not.toHaveBeenCalled();
  });

  it('does not create or notify a Follow when the target is inactive', async () => {
    const f = fixture({ inactiveUserIds: ['user-b'], followRows: [null] });

    await expect(f.store.follow(followInput)).rejects.toBeInstanceOf(
      SocialParticipantInactiveError,
    );
    expect(f.follows.updateOne).not.toHaveBeenCalled();
    expect(f.notifications.create).not.toHaveBeenCalled();
    expect(f.users.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(f.session.endSession).toHaveBeenCalledTimes(1);
  });

  it('does not create or notify a Follow when the initiating account is inactive', async () => {
    const f = fixture({ inactiveUserIds: ['user-a'], followRows: [null] });

    await expect(f.store.follow(followInput)).rejects.toBeInstanceOf(
      SocialParticipantInactiveError,
    );
    expect(f.users.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(f.follows.updateOne).not.toHaveBeenCalled();
    expect(f.notifications.create).not.toHaveBeenCalled();
  });

  it('creates a Connection and its notification after the same active User fence', async () => {
    const f = fixture({ connectionRows: [null] });

    const result = await f.store.requestConnection(connectionInput);

    expect(result.connection).toEqual(connection());
    expect(result.changed).toBe(true);
    expect(
      f.users.findOneAndUpdate.mock.calls.map(([filter]) => filter._id),
    ).toEqual(['user-a', 'user-b']);
    expect(f.connections.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: connectionInput.id,
          userLowId: 'user-a',
          userHighId: 'user-b',
          requestedByUserId: 'user-a',
          status: 'pending',
        }),
      ],
      { session: f.session },
    );
    expect(f.notifications.create).toHaveBeenCalledWith(
      [connectionInput.notification],
      { session: f.session },
    );
  });

  it.each(['pending', 'accepted'] as const)(
    'returns an existing %s Connection without creating a new relation or notification',
    async (status) => {
      const row = connection(status);
      const f = fixture({ inactiveUserIds: ['user-b'], connectionRows: [row] });

      await expect(f.store.requestConnection(connectionInput)).resolves.toEqual(
        { connection: row, changed: false },
      );
      expect(f.users.findOneAndUpdate).not.toHaveBeenCalled();
      expect(f.connections.create).not.toHaveBeenCalled();
      expect(f.notifications.create).not.toHaveBeenCalled();
    },
  );

  it('does not reopen a declined Connection after the target account closes', async () => {
    const f = fixture({
      inactiveUserIds: ['user-b'],
      connectionRows: [connection('declined')],
    });

    await expect(
      f.store.requestConnection(connectionInput),
    ).rejects.toBeInstanceOf(SocialParticipantInactiveError);
    expect(f.connections.findOneAndUpdate).not.toHaveBeenCalled();
    expect(f.connections.create).not.toHaveBeenCalled();
    expect(f.notifications.create).not.toHaveBeenCalled();
  });

  it('fences both participants before accepting a pending Connection', async () => {
    const accepted = connection('accepted');
    const f = fixture({ connectionRows: [connection()] });
    f.connections.findOneAndUpdate.mockReturnValue(query(accepted));
    const notification = {
      id: '66666666-6666-4666-8666-666666666666',
      userId: 'user-a',
      type: 'social.connection_accepted' as const,
      actorUserId: 'user-b',
      targetType: 'connection' as const,
      targetId: accepted.id,
      readAt: null,
    };

    await expect(
      f.store.respondConnection({
        id: accepted.id,
        recipientUserId: 'user-b',
        status: 'accepted',
        notification,
        now,
      }),
    ).resolves.toEqual(accepted);
    expect(
      f.users.findOneAndUpdate.mock.calls.map(([filter]) => filter._id),
    ).toEqual(['user-a', 'user-b']);
    expect(f.notifications.create).toHaveBeenCalledWith([notification], {
      session: f.session,
    });
  });

  it.each(['user-a', 'user-b'] as const)(
    'does not accept a pending Connection when participant %s is inactive',
    async (inactiveUserId) => {
      const f = fixture({
        inactiveUserIds: [inactiveUserId],
        connectionRows: [connection()],
      });

      await expect(
        f.store.respondConnection({
          id: connection().id,
          recipientUserId: 'user-b',
          status: 'accepted',
          now,
        }),
      ).rejects.toBeInstanceOf(SocialParticipantInactiveError);
      expect(f.connections.findOneAndUpdate).not.toHaveBeenCalled();
      expect(f.notifications.create).not.toHaveBeenCalled();
    },
  );

  it('lets an active recipient decline a request from a closed requester', async () => {
    const declined = connection('declined');
    const f = fixture({ inactiveUserIds: ['user-a'] });
    f.connections.findOneAndUpdate.mockReturnValue(query(declined));

    await expect(
      f.store.respondConnection({
        id: declined.id,
        recipientUserId: 'user-b',
        status: 'declined',
        now,
      }),
    ).resolves.toEqual(declined);
    expect(f.users.findOneAndUpdate).not.toHaveBeenCalled();
    expect(f.notifications.create).not.toHaveBeenCalled();
  });
});
