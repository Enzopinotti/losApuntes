import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ProfileService } from '../../profile/domain/profile.service';
import { FollowersService } from './followers.service';
import { encodeFollowersCursor } from './followers.cursor';

const id = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const at = new Date('2026-10-20T14:00:00.000Z');
const profile = {
  profileId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Estudiante',
  avatarUrl: null,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id,
    followerUserId: 'follower-a',
    followeeUserId: 'owner-b',
    createdAt: at,
    privateNotes: 'must-not-leak',
    ...overrides,
  };
}

function fixture(rows: unknown[] = [], count = 2) {
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
  const countExec = jest.fn().mockResolvedValue(count);
  const find = jest.fn().mockReturnValue(query);
  const countDocuments = jest.fn().mockReturnValue({ exec: countExec });
  const getAttributionsForUsers = jest.fn().mockResolvedValue(
    new Map([['follower-a', profile]]),
  );
  const service = new FollowersService(
    { find, countDocuments } as never,
    { getAttributionsForUsers } as unknown as ProfileService,
  );
  return {
    service,
    find,
    query,
    countDocuments,
    countExec,
    getAttributionsForUsers,
  };
}

describe('B148 private followers service', () => {
  it('filters by authenticated followee before projecting only public profiles', async () => {
    const f = fixture([row(), row({ id: secondId, followerUserId: 'follower-c' })]);
    const result = await f.service.list('owner-b', 1);
    expect(f.find).toHaveBeenCalledWith({
      $and: [{ followeeUserId: 'owner-b' }],
    });
    expect(f.query.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      followerUserId: 1,
      followeeUserId: 1,
      createdAt: 1,
    });
    expect(f.query.sort).toHaveBeenCalledWith({ createdAt: -1, id: 1 });
    expect(f.query.limit).toHaveBeenCalledWith(2);
    expect(f.getAttributionsForUsers).toHaveBeenCalledWith(['follower-a']);
    expect(result).toEqual({
      items: [{ profile, followedAt: at.toISOString() }],
      nextCursor: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain('follower-a');
    expect(JSON.stringify(result)).not.toContain('owner-b');
    expect(JSON.stringify(result)).not.toContain('privateNotes');
  });

  it('uses the signed-owner scope and correct timestamp/id seek predicate', async () => {
    const f = fixture([]);
    const cursor = encodeFollowersCursor('owner-b', { at, id });
    await expect(f.service.list('owner-b', 25, cursor)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(f.find).toHaveBeenCalledWith({
      $and: [
        { followeeUserId: 'owner-b' },
        {
          $or: [
            { createdAt: { $lt: at } },
            { createdAt: at, id: { $gt: id } },
          ],
        },
      ],
    });
    expect(f.getAttributionsForUsers).not.toHaveBeenCalled();
  });

  it('skips accounts without a visible Profile but advances over scanned edges', async () => {
    const f = fixture([row(), row({ id: secondId, followerUserId: 'missing' })]);
    f.getAttributionsForUsers.mockResolvedValue(new Map());
    const result = await f.service.list('owner-b', 1);
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it('fails before hitting Mongo for invalid page budgets or foreign cursors', async () => {
    const f = fixture();
    for (const limit of [0, 26, -2, 1.25, Number.NaN]) {
      await expect(f.service.list('owner-b', limit)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    }
    await expect(f.service.list('', 25)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    const cursor = encodeFollowersCursor('owner-b', { at, id });
    await expect(f.service.list('owner-c', 25, cursor)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(f.find).not.toHaveBeenCalled();
  });

  it('fails closed on crossed authors, invalid dates and malformed row batches', async () => {
    for (const bad of [
      row({ followeeUserId: 'other-account' }),
      row({ followerUserId: 'owner-b' }),
      row({ id: 'broken' }),
      row({ createdAt: new Date(Number.NaN) }),
    ]) {
      const f = fixture([bad]);
      await expect(f.service.list('owner-b', 25)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(f.getAttributionsForUsers).not.toHaveBeenCalled();
    }
    const f = fixture([row(), row(), row()]);
    await expect(f.service.list('owner-b', 1)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('counts only follower relations belonging to the current account', async () => {
    const f = fixture([], 7);
    await expect(f.service.count('owner-b')).resolves.toEqual({
      followersCount: 7,
    });
    expect(f.countDocuments).toHaveBeenCalledWith({
      followeeUserId: 'owner-b',
    });
    expect(f.find).not.toHaveBeenCalled();
    f.countExec.mockResolvedValue(0);
    await expect(f.service.count('owner-b')).resolves.toEqual({
      followersCount: 0,
    });
    f.countExec.mockResolvedValue(-1);
    await expect(f.service.count('owner-b')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    f.countExec.mockRejectedValue(new Error('mongo-down'));
    await expect(f.service.count('owner-b')).rejects.toThrow('mongo-down');
  });

  it('does not mask database failures as empty follower lists', async () => {
    const f = fixture();
    f.query.exec.mockRejectedValue(new Error('database-down'));
    await expect(f.service.list('owner-b', 25)).rejects.toThrow('database-down');
  });
});
