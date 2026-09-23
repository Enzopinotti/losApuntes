import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ProfileService } from '../../profile/domain/profile.service';
import type { NotificationStore } from './notification.store';
import { NotificationService } from './notification.service';
import type { NotificationRecord } from './notification.types';

const now = new Date('2026-09-23T15:00:00.000Z');

type ProfileApi = Pick<ProfileService, 'getAttributionForUser'>;

function profiles(): jest.Mocked<ProfileApi> {
  return {
    getAttributionForUser: jest.fn(),
  };
}

function store(): jest.Mocked<NotificationStore> {
  return {
    list: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    countUnread: jest.fn(),
  };
}

function row(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-a',
    type: 'social.followed',
    actorUserId: 'user-b',
    targetType: 'profile',
    targetId: '22222222-2222-4222-8222-222222222222',
    readAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('NotificationService', () => {
  it('projects only store-owned inbox rows with privacy-safe actors', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    notificationStore.list.mockResolvedValue({
      items: [row()],
      hasMore: false,
    });
    profileApi.getAttributionForUser.mockResolvedValue({
      profileId: '33333333-3333-4333-8333-333333333333',
      displayName: 'B',
      avatarUrl: null,
    });

    const result = await new NotificationService(
      notificationStore,
      profileApi as unknown as ProfileService,
    ).list('user-a', {
      unreadOnly: true,
      limit: 30,
    });

    expect(notificationStore.list).toHaveBeenCalledWith({
      userId: 'user-a',
      unreadOnly: true,
      limit: 30,
      after: undefined,
    });
    expect(result.items[0]?.actor?.displayName).toBe('B');
    expect(JSON.stringify(result)).not.toContain('user-b');
  });

  it('supports deterministic pagination cursors', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    notificationStore.list.mockResolvedValue({
      items: [row()],
      hasMore: true,
    });
    profileApi.getAttributionForUser.mockResolvedValue(null);
    const instance = new NotificationService(
      notificationStore,
      profileApi as unknown as ProfileService,
    );

    const first = await instance.list('user-a', {
      unreadOnly: false,
      limit: 1,
    });
    expect(first.nextCursor).not.toBeNull();

    notificationStore.list.mockResolvedValue({
      items: [],
      hasMore: false,
    });

    await instance.list('user-a', {
      unreadOnly: false,
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });

    expect(notificationStore.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        after: {
          createdAt: now,
          id: '11111111-1111-4111-8111-111111111111',
        },
      }),
    );
  });

  it('rejects malformed cursors before touching persistence', async () => {
    const notificationStore = store();
    const profileApi = profiles();

    await expect(
      new NotificationService(
        notificationStore,
        profileApi as unknown as ProfileService,
      ).list('user-a', {
        unreadOnly: false,
        limit: 10,
        cursor: 'not-a-valid-cursor',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(notificationStore.list).not.toHaveBeenCalled();
  });

  it('counts unread notifications through the owned store query', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    notificationStore.countUnread.mockResolvedValue(7);

    await expect(
      new NotificationService(
        notificationStore,
        profileApi as unknown as ProfileService,
      ).countUnread('user-a'),
    ).resolves.toEqual({ unreadCount: 7 });

    expect(notificationStore.countUnread).toHaveBeenCalledWith('user-a');
  });

  it('marks only an owned notification and fails opaque when absent', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    const instance = new NotificationService(
      notificationStore,
      profileApi as unknown as ProfileService,
    );

    notificationStore.markRead.mockResolvedValue(row({ readAt: now }));
    await expect(
      instance.markRead('user-a', '11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual({ read: true });

    notificationStore.markRead.mockResolvedValue(null);
    await expect(
      instance.markRead('user-b', '11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks all unread notifications only through the acting user scope', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    notificationStore.markAllRead.mockResolvedValue(4);

    const result = await new NotificationService(
      notificationStore,
      profileApi as unknown as ProfileService,
    ).markAllRead('user-a');

    expect(result).toEqual({ updated: 4 });
    expect(notificationStore.markAllRead).toHaveBeenCalledWith(
      'user-a',
      expect.any(Date),
    );
  });

  it('rejects a cursor with a structurally valid but invalid date', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: 'not-a-date',
        id: '11111111-1111-4111-8111-111111111111',
      }),
      'utf8',
    ).toString('base64url');

    await expect(
      new NotificationService(
        notificationStore,
        profileApi as unknown as ProfileService,
      ).list('user-a', {
        unreadOnly: false,
        limit: 10,
        cursor,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(notificationStore.list).not.toHaveBeenCalled();
  });

  it('projects system notifications without inventing an actor', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    notificationStore.list.mockResolvedValue({
      items: [row({ actorUserId: null })],
      hasMore: false,
    });

    const result = await new NotificationService(
      notificationStore,
      profileApi as unknown as ProfileService,
    ).list('user-a', {
      unreadOnly: false,
      limit: 10,
    });

    expect(result.items[0]?.actor).toBeNull();
    expect(profileApi.getAttributionForUser).not.toHaveBeenCalled();
  });
});
