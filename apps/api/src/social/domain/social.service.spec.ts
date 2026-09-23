import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ProfileService } from '../../profile/domain/profile.service';
import type { SocialStore } from './social.store';
import { SocialService } from './social.service';
import type { ConnectionRecord, FollowRecord } from './social.types';

const now = new Date('2026-09-23T15:00:00.000Z');

type ProfileApi = Pick<
  ProfileService,
  'getAttributionForUser' | 'resolveUserIdByProfileId'
>;

function profileApi(): jest.Mocked<ProfileApi> {
  return {
    getAttributionForUser: jest.fn(),
    resolveUserIdByProfileId: jest.fn(),
  };
}

function store(): jest.Mocked<SocialStore> {
  return {
    follow: jest.fn(),
    unfollow: jest.fn(),
    listFollowing: jest.fn(),
    requestConnection: jest.fn(),
    findConnectionById: jest.fn(),
    listConnections: jest.fn(),
    respondConnection: jest.fn(),
    disconnectConnection: jest.fn(),
  };
}

function service(
  socialStore: jest.Mocked<SocialStore>,
  profiles: jest.Mocked<ProfileApi>,
) {
  return new SocialService(socialStore, profiles as unknown as ProfileService);
}

function connection(
  overrides: Partial<ConnectionRecord> = {},
): ConnectionRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userLowId: 'user-a',
    userHighId: 'user-b',
    requestedByUserId: 'user-a',
    status: 'pending',
    respondedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function follow(overrides: Partial<FollowRecord> = {}): FollowRecord {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    followerUserId: 'user-a',
    followeeUserId: 'user-b',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('SocialService', () => {
  it('requires a Profile before creating social state', async () => {
    const socialStore = store();
    const profiles = profileApi();
    profiles.getAttributionForUser.mockResolvedValue(null);

    await expect(
      service(socialStore, profiles).follow(
        'user-a',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(socialStore.follow).not.toHaveBeenCalled();
  });

  it('rejects self follow and self connection', async () => {
    const socialStore = store();
    const profiles = profileApi();
    profiles.getAttributionForUser.mockResolvedValue({
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: 'A',
      avatarUrl: null,
    });
    profiles.resolveUserIdByProfileId.mockResolvedValue('user-a');

    const instance = service(socialStore, profiles);

    await expect(
      instance.follow('user-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      instance.requestConnection(
        'user-a',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('creates a follow notification only through the transactional store contract', async () => {
    const socialStore = store();
    const profiles = profileApi();
    profiles.getAttributionForUser.mockResolvedValue({
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: 'A',
      avatarUrl: null,
    });
    profiles.resolveUserIdByProfileId.mockResolvedValue('user-b');
    socialStore.follow.mockResolvedValue({
      follow: follow(),
      created: true,
    });

    const result = await service(socialStore, profiles).follow(
      'user-a',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );

    expect(result).toEqual({ following: true });
    const followCall = socialStore.follow.mock.calls[0]?.[0];
    expect(followCall?.followerUserId).toBe('user-a');
    expect(followCall?.followeeUserId).toBe('user-b');
    expect(followCall?.notification.userId).toBe('user-b');
    expect(followCall?.notification.actorUserId).toBe('user-a');
    expect(followCall?.notification.type).toBe('social.followed');
    expect(followCall?.notification.targetType).toBe('profile');
    expect(followCall?.notification.targetId).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
  });

  it('lists following profiles without leaking missing/private attribution rows', async () => {
    const socialStore = store();
    const profiles = profileApi();
    socialStore.listFollowing.mockResolvedValue([
      follow(),
      follow({
        id: '33333333-3333-4333-8333-333333333333',
        followeeUserId: 'user-c',
      }),
    ]);
    profiles.getAttributionForUser.mockImplementation((userId) =>
      Promise.resolve(
        userId === 'user-b'
          ? {
              profileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              displayName: 'B',
              avatarUrl: null,
            }
          : null,
      ),
    );

    const result = await service(socialStore, profiles).listFollowing(
      'user-a',
      20,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.profile.profileId).toBe(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );
  });

  it('projects outgoing and incoming connection direction server-side', async () => {
    const socialStore = store();
    const profiles = profileApi();
    profiles.getAttributionForUser.mockResolvedValue({
      profileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      displayName: 'B',
      avatarUrl: null,
    });
    socialStore.listConnections.mockResolvedValue([connection()]);

    const outgoing = await service(socialStore, profiles).listConnections(
      'user-a',
      undefined,
      20,
    );
    expect(outgoing.items[0]).toEqual(
      expect.objectContaining({
        requestedByMe: true,
        incoming: false,
      }),
    );

    const incoming = await service(socialStore, profiles).listConnections(
      'user-b',
      'pending',
      20,
    );
    expect(incoming.items[0]).toEqual(
      expect.objectContaining({
        requestedByMe: false,
        incoming: true,
      }),
    );
  });

  it('allows only the request recipient to accept or decline', async () => {
    const socialStore = store();
    const profiles = profileApi();
    socialStore.findConnectionById.mockResolvedValue(connection());

    await expect(
      service(socialStore, profiles).respond(
        'user-a',
        '11111111-1111-4111-8111-111111111111',
        'accepted',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(socialStore.respondConnection).not.toHaveBeenCalled();
  });

  it('hides a connection from non-participants', async () => {
    const socialStore = store();
    const profiles = profileApi();
    socialStore.findConnectionById.mockResolvedValue(connection());

    await expect(
      service(socialStore, profiles).respond(
        'user-c',
        '11111111-1111-4111-8111-111111111111',
        'declined',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts a pending request and notifies the original requester', async () => {
    const socialStore = store();
    const profiles = profileApi();
    const pending = connection();
    const accepted = connection({
      status: 'accepted',
      respondedAt: now,
    });

    socialStore.findConnectionById.mockResolvedValue(pending);
    socialStore.respondConnection.mockResolvedValue(accepted);
    profiles.getAttributionForUser.mockResolvedValue({
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: 'A',
      avatarUrl: null,
    });

    const result = await service(socialStore, profiles).respond(
      'user-b',
      pending.id,
      'accepted',
    );

    expect(result.connection.status).toBe('accepted');
    const respondCall = socialStore.respondConnection.mock.calls[0]?.[0];
    expect(respondCall?.id).toBe(pending.id);
    expect(respondCall?.recipientUserId).toBe('user-b');
    expect(respondCall?.status).toBe('accepted');
    expect(respondCall?.notification?.userId).toBe('user-a');
    expect(respondCall?.notification?.actorUserId).toBe('user-b');
    expect(respondCall?.notification?.type).toBe('social.connection_accepted');
  });

  it('returns stable conflict when a connection changes concurrently', async () => {
    const socialStore = store();
    const profiles = profileApi();
    socialStore.findConnectionById.mockResolvedValue(connection());
    socialStore.respondConnection.mockResolvedValue(null);

    await expect(
      service(socialStore, profiles).respond(
        'user-b',
        '11111111-1111-4111-8111-111111111111',
        'declined',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('disconnects only an accepted relation', async () => {
    const socialStore = store();
    const profiles = profileApi();

    socialStore.findConnectionById.mockResolvedValueOnce(connection());
    await expect(
      service(socialStore, profiles).disconnect(
        'user-b',
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    socialStore.findConnectionById.mockResolvedValueOnce(
      connection({ status: 'accepted' }),
    );
    socialStore.disconnectConnection.mockResolvedValue(
      connection({ status: 'disconnected', respondedAt: now }),
    );

    await expect(
      service(socialStore, profiles).disconnect(
        'user-b',
        '11111111-1111-4111-8111-111111111111',
      ),
    ).resolves.toBeUndefined();
  });

  it('unfollows a resolved target and rejects self-unfollow', async () => {
    const socialStore = store();
    const profiles = profileApi();
    profiles.resolveUserIdByProfileId
      .mockResolvedValueOnce('user-b')
      .mockResolvedValueOnce('user-a');

    const instance = service(socialStore, profiles);

    await expect(
      instance.unfollow('user-a', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    ).resolves.toBeUndefined();
    expect(socialStore.unfollow).toHaveBeenCalledWith('user-a', 'user-b');

    await expect(
      instance.unfollow('user-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('fails opaque when a target Profile cannot be resolved', async () => {
    const socialStore = store();
    const profiles = profileApi();
    profiles.getAttributionForUser.mockResolvedValue({
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: 'A',
      avatarUrl: null,
    });
    profiles.resolveUserIdByProfileId.mockResolvedValue(null);

    await expect(
      service(socialStore, profiles).requestConnection(
        'user-a',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(socialStore.requestConnection).not.toHaveBeenCalled();
  });

  it('creates and projects a pending connection request transactionally', async () => {
    const socialStore = store();
    const profiles = profileApi();
    profiles.getAttributionForUser.mockImplementation((userId) =>
      Promise.resolve({
        profileId:
          userId === 'user-a'
            ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
            : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        displayName: userId === 'user-a' ? 'A' : 'B',
        avatarUrl: null,
      }),
    );
    profiles.resolveUserIdByProfileId.mockResolvedValue('user-b');
    socialStore.requestConnection.mockImplementation((input) =>
      Promise.resolve({
        connection: connection({
          id: input.id,
          userLowId: 'user-a',
          userHighId: 'user-b',
          requestedByUserId: 'user-a',
        }),
        changed: true,
      }),
    );

    const result = await service(socialStore, profiles).requestConnection(
      'user-a',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );

    expect(result.connection).toEqual(
      expect.objectContaining({
        status: 'pending',
        requestedByMe: true,
        incoming: false,
      }),
    );
    const requestCall = socialStore.requestConnection.mock.calls[0]?.[0];
    expect(requestCall?.requesterUserId).toBe('user-a');
    expect(requestCall?.targetUserId).toBe('user-b');
    expect(requestCall?.notification.type).toBe('social.connection_requested');
    expect(requestCall?.notification.userId).toBe('user-b');
    expect(requestCall?.notification.actorUserId).toBe('user-a');
  });

  it('rejects response once the connection is no longer pending', async () => {
    const socialStore = store();
    const profiles = profileApi();
    socialStore.findConnectionById.mockResolvedValue(
      connection({ status: 'accepted', respondedAt: now }),
    );

    await expect(
      service(socialStore, profiles).respond(
        'user-b',
        '11111111-1111-4111-8111-111111111111',
        'declined',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(socialStore.respondConnection).not.toHaveBeenCalled();
  });

  it('declines a pending request without an acceptance notification', async () => {
    const socialStore = store();
    const profiles = profileApi();
    const pending = connection();
    const declined = connection({
      status: 'declined',
      respondedAt: now,
    });
    socialStore.findConnectionById.mockResolvedValue(pending);
    socialStore.respondConnection.mockResolvedValue(declined);
    profiles.getAttributionForUser.mockResolvedValue({
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: 'A',
      avatarUrl: null,
    });

    const result = await service(socialStore, profiles).respond(
      'user-b',
      pending.id,
      'declined',
    );

    expect(result.connection.status).toBe('declined');
    const call = socialStore.respondConnection.mock.calls[0]?.[0];
    expect(call?.notification).toBeUndefined();
  });

  it('fails disconnect when the accepted relation changes concurrently', async () => {
    const socialStore = store();
    const profiles = profileApi();
    socialStore.findConnectionById.mockResolvedValue(
      connection({ status: 'accepted', respondedAt: now }),
    );
    socialStore.disconnectConnection.mockResolvedValue(null);

    await expect(
      service(socialStore, profiles).disconnect(
        'user-a',
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails closed when a connection participant no longer has attribution', async () => {
    const socialStore = store();
    const profiles = profileApi();
    socialStore.listConnections.mockResolvedValue([
      connection({ status: 'accepted', respondedAt: now }),
    ]);
    profiles.getAttributionForUser.mockResolvedValue(null);

    await expect(
      service(socialStore, profiles).listConnections('user-a', 'accepted', 20),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('paginates following with a deterministic opaque cursor', async () => {
    const socialStore = store();
    const profiles = profileApi();
    const first = follow();
    const second = follow({
      id: '33333333-3333-4333-8333-333333333333',
      followeeUserId: 'user-c',
      createdAt: new Date('2026-09-23T14:00:00.000Z'),
      updatedAt: new Date('2026-09-23T14:00:00.000Z'),
    });
    socialStore.listFollowing
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([second]);
    profiles.getAttributionForUser.mockImplementation((userId) =>
      Promise.resolve({
        profileId:
          userId === 'user-b'
            ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
            : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        displayName: userId === 'user-b' ? 'B' : 'C',
        avatarUrl: null,
      }),
    );

    const instance = service(socialStore, profiles);
    const page = await instance.listFollowing('user-a', 1);

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    expect(socialStore.listFollowing).toHaveBeenCalledWith(
      'user-a',
      2,
      undefined,
    );

    const next = await instance.listFollowing(
      'user-a',
      1,
      page.nextCursor ?? undefined,
    );

    expect(next.items[0]?.profile.profileId).toBe(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    );
    expect(socialStore.listFollowing).toHaveBeenLastCalledWith('user-a', 2, {
      at: now,
      id: first.id,
    });
  });

  it('rejects malformed social cursors before persistence reads', async () => {
    const socialStore = store();
    const profiles = profileApi();
    const instance = service(socialStore, profiles);

    await expect(
      instance.listFollowing('user-a', 20, 'invalid-cursor'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      instance.listConnections(
        'user-a',
        undefined,
        20,
        Buffer.from(
          JSON.stringify({ at: 'not-a-date', id: 'connection' }),
          'utf8',
        ).toString('base64url'),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(socialStore.listFollowing).not.toHaveBeenCalled();
    expect(socialStore.listConnections).not.toHaveBeenCalled();
  });

  it('paginates connections by updatedAt and stable id', async () => {
    const socialStore = store();
    const profiles = profileApi();
    const first = connection({ status: 'accepted', respondedAt: now });
    const second = connection({
      id: '44444444-4444-4444-8444-444444444444',
      userLowId: 'user-a',
      userHighId: 'user-c',
      requestedByUserId: 'user-c',
      status: 'accepted',
      respondedAt: new Date('2026-09-23T14:00:00.000Z'),
      updatedAt: new Date('2026-09-23T14:00:00.000Z'),
    });
    socialStore.listConnections
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([second]);
    profiles.getAttributionForUser.mockImplementation((userId) =>
      Promise.resolve({
        profileId:
          userId === 'user-b'
            ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
            : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        displayName: userId === 'user-b' ? 'B' : 'C',
        avatarUrl: null,
      }),
    );

    const instance = service(socialStore, profiles);
    const page = await instance.listConnections('user-a', 'accepted', 1);

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    expect(socialStore.listConnections).toHaveBeenCalledWith(
      'user-a',
      'accepted',
      2,
      undefined,
    );

    await instance.listConnections(
      'user-a',
      'accepted',
      1,
      page.nextCursor ?? undefined,
    );

    expect(socialStore.listConnections).toHaveBeenLastCalledWith(
      'user-a',
      'accepted',
      2,
      {
        at: now,
        id: first.id,
      },
    );
  });

  it('provides bounded deduplicated feed relations and reports truncation', async () => {
    const socialStore = store();
    const profiles = profileApi();
    const following = Array.from({ length: 501 }, (_, index) =>
      follow({
        id: `follow-${index}`,
        followeeUserId: index % 2 === 0 ? 'user-b' : 'user-c',
      }),
    );
    const connections = Array.from({ length: 501 }, (_, index) =>
      connection({
        id: `connection-${index}`,
        userLowId: index % 2 === 0 ? 'user-a' : 'user-d',
        userHighId: index % 2 === 0 ? 'user-d' : 'user-a',
        status: 'accepted',
      }),
    );
    socialStore.listFollowing.mockResolvedValue(following);
    socialStore.listConnections.mockResolvedValue(connections);

    const result = await service(socialStore, profiles).getFeedRelations(
      'user-a',
    );

    expect(socialStore.listFollowing).toHaveBeenCalledWith('user-a', 501);
    expect(socialStore.listConnections).toHaveBeenCalledWith(
      'user-a',
      'accepted',
      501,
    );
    expect(result.followingUserIds).toEqual(['user-b', 'user-c']);
    expect(result.connectionUserIds).toEqual(['user-d']);
    expect(result.truncated).toBe(true);
  });

});
