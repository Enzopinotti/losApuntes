import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ProfileService } from '../../profile/domain/profile.service';
import { MAX_NOTIFICATION_SYNC_RECIPIENTS } from './notification-fanout';
import type { NotificationStore } from './notification.store';
import { NotificationService } from './notification.service';
import type {
  CreateNotificationRecord,
  NotificationRecord,
} from './notification.types';

const now = new Date('2026-09-23T15:00:00.000Z');

type ProfileApi = Pick<
  ProfileService,
  'getAttributionForUser' | 'getProfileIdsForAccountExport'
>;

function profiles(): jest.Mocked<ProfileApi> {
  return {
    getAttributionForUser: jest.fn(),
    getProfileIdsForAccountExport: jest.fn(),
  };
}

function store(): jest.Mocked<NotificationStore> {
  return {
    createMany: jest.fn(),
    list: jest.fn(),
    listForAccountExport: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    countUnread: jest.fn(),
  };
}

function createRecord(index: number): CreateNotificationRecord {
  return {
    id: `notification-${index}`,
    userId: `user-${index}`,
    type: 'social.followed',
    actorUserId: 'actor-user',
    targetType: 'profile',
    targetId: `profile-${index}`,
    readAt: null,
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
  it('persists a synchronous fan-out at the recipient budget', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    const records = Array.from(
      { length: MAX_NOTIFICATION_SYNC_RECIPIENTS },
      (_, index) => createRecord(index),
    );
    notificationStore.createMany.mockResolvedValue(records.length);

    await expect(
      new NotificationService(
        notificationStore,
        profileApi as unknown as ProfileService,
      ).createMany(records),
    ).resolves.toEqual({ created: MAX_NOTIFICATION_SYNC_RECIPIENTS });

    expect(notificationStore.createMany.mock.calls).toEqual([[records]]);
  });

  it('rejects fan-out overflow before persistence', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    const records = Array.from(
      { length: MAX_NOTIFICATION_SYNC_RECIPIENTS + 1 },
      (_, index) => createRecord(index),
    );

    await expect(
      new NotificationService(
        notificationStore,
        profileApi as unknown as ProfileService,
      ).createMany(records),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(notificationStore.createMany.mock.calls).toHaveLength(0);
  });

  it('rejects record amplification even when all rows target one recipient', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    const records = Array.from(
      { length: MAX_NOTIFICATION_SYNC_RECIPIENTS + 1 },
      (_, index) => ({
        ...createRecord(index),
        userId: 'same-recipient',
      }),
    );

    await expect(
      new NotificationService(
        notificationStore,
        profileApi as unknown as ProfileService,
      ).createMany(records),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(notificationStore.createMany.mock.calls).toHaveLength(0);
  });

  it('does not touch persistence for an empty notification batch', async () => {
    const notificationStore = store();
    const profileApi = profiles();

    await expect(
      new NotificationService(
        notificationStore,
        profileApi as unknown as ProfileService,
      ).createMany([]),
    ).resolves.toEqual({ created: 0 });

    expect(notificationStore.createMany.mock.calls).toHaveLength(0);
  });

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

  it('acknowledges retrying an already-read owned notification', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    const originalReadAt = new Date('2026-10-11T12:10:00.000Z');
    const alreadyRead = row({ readAt: originalReadAt });
    notificationStore.markRead.mockResolvedValue(alreadyRead);
    const service = new NotificationService(
      notificationStore,
      profileApi as unknown as ProfileService,
    );

    await expect(
      service.markRead('user-a', alreadyRead.id),
    ).resolves.toEqual({ read: true });
    await expect(
      service.markRead('user-a', alreadyRead.id),
    ).resolves.toEqual({ read: true });

    expect(notificationStore.markRead).toHaveBeenCalledTimes(2);
    expect(notificationStore.markRead.mock.calls[0]?.slice(0, 2)).toEqual([
      'user-a',
      alreadyRead.id,
    ]);
    expect(notificationStore.markRead.mock.calls[1]?.slice(0, 2)).toEqual([
      'user-a',
      alreadyRead.id,
    ]);
    expect(alreadyRead.readAt).toBe(originalReadAt);
    expect(profileApi.getAttributionForUser).not.toHaveBeenCalled();
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

  it('exports owner inbox records with stable actor Profile ids and reference-only targets', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    const source = row({
      type: 'qa.answer_accepted',
      targetType: 'question',
      targetId: 'question-1',
      readAt: now,
    });
    notificationStore.listForAccountExport
      .mockResolvedValueOnce({ items: [source], hasMore: true })
      .mockResolvedValueOnce({ items: [], hasMore: false });
    profileApi.getProfileIdsForAccountExport
      .mockResolvedValueOnce(new Map([['user-b', 'profile-b-stable-id']]))
      .mockResolvedValueOnce(new Map());
    const instance = new NotificationService(
      notificationStore,
      profileApi as unknown as ProfileService,
    );

    const first = await instance.listAccountExportNotifications('user-a', {
      limit: 1,
      cursor: null,
    });

    expect(first.items).toEqual([
      {
        id: source.id,
        type: 'qa.answer_accepted',
        actorProfileId: 'profile-b-stable-id',
        targetType: 'question',
        targetId: 'question-1',
        readAt: now.toISOString(),
        createdAt: now.toISOString(),
      },
    ]);
    expect(JSON.stringify(first)).not.toContain('user-a');
    expect(JSON.stringify(first)).not.toContain('user-b');
    expect(first.nextCursor).not.toBeNull();
    expect(notificationStore.listForAccountExport).toHaveBeenCalledWith({
      userId: 'user-a',
      limit: 1,
      after: undefined,
    });
    expect(profileApi.getProfileIdsForAccountExport).toHaveBeenCalledWith([
      'user-b',
    ]);

    await expect(
      instance.listAccountExportNotifications('user-a', {
        limit: 1,
        cursor: first.nextCursor,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(notificationStore.listForAccountExport).toHaveBeenLastCalledWith({
      userId: 'user-a',
      limit: 1,
      after: {
        createdAt: now,
        id: source.id,
      },
    });
    expect(profileApi.getProfileIdsForAccountExport).toHaveBeenLastCalledWith(
      [],
    );
  });

  it('preserves a null system actor and fails closed when an actor Profile is missing', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    const instance = new NotificationService(
      notificationStore,
      profileApi as unknown as ProfileService,
    );
    notificationStore.listForAccountExport.mockResolvedValueOnce({
      items: [row({ actorUserId: null })],
      hasMore: false,
    });
    profileApi.getProfileIdsForAccountExport.mockResolvedValueOnce(new Map());

    const systemPage = await instance.listAccountExportNotifications('user-a', {
      limit: 10,
      cursor: null,
    });
    expect(systemPage.items[0]?.actorProfileId).toBeNull();

    notificationStore.listForAccountExport.mockResolvedValueOnce({
      items: [row({ actorUserId: 'user-b' })],
      hasMore: false,
    });
    profileApi.getProfileIdsForAccountExport.mockResolvedValueOnce(new Map());

    await expect(
      instance.listAccountExportNotifications('user-a', {
        limit: 10,
        cursor: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid export limits and noncanonical cursors before persistence', async () => {
    const notificationStore = store();
    const profileApi = profiles();
    const instance = new NotificationService(
      notificationStore,
      profileApi as unknown as ProfileService,
    );

    await expect(
      instance.listAccountExportNotifications('user-a', {
        limit: 101,
        cursor: null,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      instance.listAccountExportNotifications('user-a', {
        limit: 10,
        cursor: Buffer.from(
          JSON.stringify({ createdAt: now.toISOString(), id: 'n-1', extra: 1 }),
          'utf8',
        ).toString('base64url'),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      instance.listAccountExportNotifications('user-a', {
        limit: 10,
        cursor: 'bad-padding=',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(notificationStore.listForAccountExport).not.toHaveBeenCalled();
  });
});
