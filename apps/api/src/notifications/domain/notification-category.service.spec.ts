import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ProfileService } from '../../profile/domain/profile.service';
import { encodeNotificationCategoryCursor } from './notification-category.cursor';
import { NotificationCategoryService } from './notification-category.service';

const id = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const targetId = '33333333-3333-4333-8333-333333333333';
const createdAt = new Date('2026-10-20T12:00:00.000Z');
const profile = {
  profileId: '44444444-4444-4444-8444-444444444444',
  displayName: 'Compañera',
  avatarUrl: null,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: 'owner-a',
    type: 'social.followed',
    actorUserId: 'actor-b',
    targetType: 'profile',
    targetId,
    readAt: null,
    createdAt,
    internalSecret: 'never-expose-this',
    ...overrides,
  };
}

function setup(rows: unknown[] = [], social = 3, qa = 2) {
  const query = {
    select: jest.fn(),
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(rows),
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  const find = jest.fn().mockReturnValue(query);
  const socialExec = jest.fn().mockResolvedValue(social);
  const qaExec = jest.fn().mockResolvedValue(qa);
  const countDocuments = jest
    .fn()
    .mockReturnValueOnce({ exec: socialExec })
    .mockReturnValueOnce({ exec: qaExec });
  const getAttributionsForUsers = jest
    .fn()
    .mockResolvedValue(new Map([['actor-b', profile]]));
  const service = new NotificationCategoryService(
    { find, countDocuments } as never,
    { getAttributionsForUsers } as unknown as ProfileService,
  );
  return {
    service,
    find,
    query,
    countDocuments,
    socialExec,
    qaExec,
    getAttributionsForUsers,
  };
}

describe('B149 notification categories private data access', () => {
  it('filters the acting owner and exact social types before bounded pagination', async () => {
    const f = setup([row(), row({ id: secondId })]);
    const result = await f.service.list('owner-a', 'social', {
      unreadOnly: true,
      limit: 1,
    });

    expect(f.find).toHaveBeenCalledWith({
      $and: [
        { userId: 'owner-a' },
        {
          type: {
            $in: [
              'social.followed',
              'social.connection_requested',
              'social.connection_accepted',
            ],
          },
        },
        { readAt: null },
      ],
    });
    expect(f.query.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      userId: 1,
      type: 1,
      actorUserId: 1,
      targetType: 1,
      targetId: 1,
      readAt: 1,
      createdAt: 1,
    });
    expect(f.query.sort).toHaveBeenCalledWith({ createdAt: -1, id: 1 });
    expect(f.query.limit).toHaveBeenCalledWith(2);
    expect(f.getAttributionsForUsers).toHaveBeenCalledWith(['actor-b']);
    expect(result.items).toEqual([
      {
        id,
        type: 'social.followed',
        actor: profile,
        target: { type: 'profile', id: targetId },
        readAt: null,
        createdAt: createdAt.toISOString(),
      },
    ]);
    expect(typeof result.nextCursor).toBe('string');
    expect(JSON.stringify(result)).not.toContain('owner-a');
    expect(JSON.stringify(result)).not.toContain('actor-b');
    expect(JSON.stringify(result)).not.toContain('internalSecret');
  });

  it('supports Q&A history with a scoped descending timestamp/id cursor', async () => {
    const f = setup([]);
    const cursor = encodeNotificationCategoryCursor('owner-a', 'qa', false, {
      id,
      createdAt,
    });
    await expect(
      f.service.list('owner-a', 'qa', {
        unreadOnly: false,
        limit: 15,
        cursor,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(f.find).toHaveBeenCalledWith({
      $and: [
        { userId: 'owner-a' },
        { type: { $in: ['qa.question_answered', 'qa.answer_accepted'] } },
        {
          $or: [
            { createdAt: { $lt: createdAt } },
            { createdAt, id: { $gt: id } },
          ],
        },
      ],
    });
    expect(f.getAttributionsForUsers).not.toHaveBeenCalled();
  });

  it('preserves notifications even when a public actor profile is unavailable', async () => {
    const f = setup([row({ actorUserId: 'missing' })]);
    f.getAttributionsForUsers.mockResolvedValue(new Map());
    const result = await f.service.list('owner-a', 'social', {
      unreadOnly: false,
      limit: 30,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.actor).toBeNull();
    expect(result.nextCursor).toBeNull();
  });

  it('rejects other owners, invalid categories and limits before storage access', async () => {
    const f = setup();
    for (const limit of [0, 31, -2, 1.5, Number.NaN]) {
      await expect(
        f.service.list('owner-a', 'social', {
          unreadOnly: false,
          limit,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    await expect(
      f.service.list('', 'social', { unreadOnly: false, limit: 30 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      f.service.list('owner-a', 'unknown', {
        unreadOnly: false,
        limit: 30,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    const cursor = encodeNotificationCategoryCursor('owner-a', 'social', true, {
      id,
      createdAt,
    });
    await expect(
      f.service.list('owner-b', 'social', {
        unreadOnly: true,
        limit: 30,
        cursor,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(f.find).not.toHaveBeenCalled();
  });

  it('fails closed before profile lookup on crossed owners or invalid persistence', async () => {
    for (const bad of [
      row({ userId: 'owner-b' }),
      row({ type: 'qa.question_answered' }),
      row({ targetType: 'answer' }),
      row({ id: 'invalid-uuid' }),
      row({ targetId: 'invalid-uuid' }),
      row({ actorUserId: '' }),
      row({ readAt: 'not-date' }),
      row({ createdAt: new Date(Number.NaN) }),
    ]) {
      const f = setup([bad]);
      await expect(
        f.service.list('owner-a', 'social', {
          unreadOnly: false,
          limit: 30,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(f.getAttributionsForUsers).not.toHaveBeenCalled();
    }
    const f = setup([row(), row(), row()]);
    await expect(
      f.service.list('owner-a', 'social', {
        unreadOnly: false,
        limit: 1,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('counts unread categories separately without loading content or profiles', async () => {
    const f = setup();
    await expect(f.service.unreadCounts('owner-a')).resolves.toEqual({
      socialUnreadCount: 3,
      qaUnreadCount: 2,
    });
    expect(f.countDocuments).toHaveBeenCalledWith({
      userId: 'owner-a',
      type: {
        $in: [
          'social.followed',
          'social.connection_requested',
          'social.connection_accepted',
        ],
      },
      readAt: null,
    });
    expect(f.countDocuments).toHaveBeenCalledWith({
      userId: 'owner-a',
      type: { $in: ['qa.question_answered', 'qa.answer_accepted'] },
      readAt: null,
    });
    expect(f.find).not.toHaveBeenCalled();
    expect(f.getAttributionsForUsers).not.toHaveBeenCalled();
  });

  it('never masks corrupt counts or storage outages as zero', async () => {
    const f = setup();
    f.socialExec.mockResolvedValue(-1);
    await expect(f.service.unreadCounts('owner-a')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    const g = setup();
    g.qaExec.mockRejectedValue(new Error('mongo-down'));
    await expect(g.service.unreadCounts('owner-a')).rejects.toThrow(
      'mongo-down',
    );
  });

  it('preserves real datastore errors in listings', async () => {
    const f = setup();
    f.query.exec.mockRejectedValue(new Error('mongo-offline'));
    await expect(
      f.service.list('owner-a', 'qa', { unreadOnly: false, limit: 25 }),
    ).rejects.toThrow('mongo-offline');
  });
});
