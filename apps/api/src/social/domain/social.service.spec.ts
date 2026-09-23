import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ProfileService } from '../../profile/domain/profile.service';
import type { SocialStore } from './social.store';
import { SocialService } from './social.service';
import type {
  ConnectionRecord,
  FollowRecord,
} from './social.types';

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
  return new SocialService(
    socialStore,
    profiles as unknown as ProfileService,
  );
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

function follow(
  overrides: Partial<FollowRecord> = {},
): FollowRecord {
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
    expect(socialStore.follow).toHaveBeenCalledWith(
      expect.objectContaining({
        followerUserId: 'user-a',
        followeeUserId: 'user-b',
        notification: expect.objectContaining({
          userId: 'user-b',
          actorUserId: 'user-a',
          type: 'social.followed',
          targetType: 'profile',
          targetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
      }),
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

    const outgoing = await service(
      socialStore,
      profiles,
    ).listConnections('user-a', undefined, 20);
    expect(outgoing.items[0]).toEqual(
      expect.objectContaining({
        requestedByMe: true,
        incoming: false,
      }),
    );

    const incoming = await service(
      socialStore,
      profiles,
    ).listConnections('user-b', 'pending', 20);
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
    expect(socialStore.respondConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: pending.id,
        recipientUserId: 'user-b',
        status: 'accepted',
        notification: expect.objectContaining({
          userId: 'user-a',
          actorUserId: 'user-b',
          type: 'social.connection_accepted',
        }),
      }),
    );
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
});
