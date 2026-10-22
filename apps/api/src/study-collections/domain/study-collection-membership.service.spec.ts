import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ResourceService } from '../../resources/domain/resource.service';
import { encodeMembershipCursor } from './study-collection-membership.cursor';
import { StudyCollectionMembershipService } from './study-collection-membership.service';

const resourceId = '11111111-1111-4111-8111-111111111111';
const collectionId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const updatedAt = new Date('2026-10-20T13:00:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: collectionId,
    ownerUserId: 'owner-a',
    title: 'Parciales de Análisis',
    revision: 3,
    resourceIds: [resourceId],
    updatedAt,
    privateNote: 'never-visible',
    ...overrides,
  };
}

function setup(rows: unknown[] = []) {
  const query = {
    select: jest.fn(),
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    maxTimeMS: jest.fn(),
    exec: jest.fn().mockResolvedValue(rows),
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  query.maxTimeMS.mockReturnValue(query);
  const find = jest.fn().mockReturnValue(query);
  const get = jest.fn().mockResolvedValue({ resource: { id: resourceId } });
  const service = new StudyCollectionMembershipService(
    { find } as never,
    { get } as unknown as ResourceService,
  );
  return { service, find, get, query };
}

describe('B151 private resource collection membership', () => {
  it('checks resource authority before querying only the authenticated collections', async () => {
    const f = setup([row(), row({ id: otherId, title: 'Prácticos' })]);
    const result = await f.service.list('owner-a', resourceId, {
      limit: 1,
    });

    expect(f.get).toHaveBeenCalledWith(resourceId, 'owner-a');
    expect(f.find).toHaveBeenCalledWith({
      $and: [{ ownerUserId: 'owner-a' }, { resourceIds: resourceId }],
    });
    expect(f.query.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      ownerUserId: 1,
      title: 1,
      revision: 1,
      resourceIds: 1,
      updatedAt: 1,
    });
    expect(f.query.sort).toHaveBeenCalledWith({ updatedAt: -1, id: 1 });
    expect(f.query.limit).toHaveBeenCalledWith(2);
    expect(f.query.maxTimeMS).toHaveBeenCalledWith(5000);
    expect(result.items).toEqual([
      {
        id: collectionId,
        title: 'Parciales de Análisis',
        resourceCount: 1,
        revision: 3,
        updatedAt: updatedAt.toISOString(),
      },
    ]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toContain('owner-a');
    expect(JSON.stringify(result)).not.toContain('privateNote');
  });

  it('normalizes uppercase resource UUIDs before authority, cursor and Mongo checks', async () => {
    const f = setup();
    const uppercaseResourceId = resourceId.toUpperCase();
    const cursor = encodeMembershipCursor('owner-a', resourceId, {
      updatedAt,
      id: collectionId,
    });

    await f.service.list('owner-a', uppercaseResourceId, { limit: 25, cursor });

    expect(f.get).toHaveBeenCalledWith(resourceId, 'owner-a');
    expect(f.find).toHaveBeenCalledWith({
      $and: [
        { ownerUserId: 'owner-a' },
        { resourceIds: resourceId },
        {
          $or: [
            { updatedAt: { $lt: updatedAt } },
            { updatedAt, id: { $gt: collectionId } },
          ],
        },
      ],
    });
  });

  it('seeks by timestamp descending, ID ascending, always inside owner and resource filters', async () => {
    const f = setup();
    const cursor = encodeMembershipCursor('owner-a', resourceId, {
      updatedAt,
      id: collectionId,
    });
    await expect(
      f.service.list('owner-a', resourceId, {
        limit: 25,
        cursor,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(f.find).toHaveBeenCalledWith({
      $and: [
        { ownerUserId: 'owner-a' },
        { resourceIds: resourceId },
        {
          $or: [
            { updatedAt: { $lt: updatedAt } },
            { updatedAt, id: { $gt: collectionId } },
          ],
        },
      ],
    });
  });

  it('does not disclose memberships for hidden, deleted or unreadable resources', async () => {
    for (const failure of [
      new ForbiddenException('not-public'),
      new NotFoundException('missing'),
      new Error('resource-database-down'),
    ]) {
      const f = setup([row()]);
      f.get.mockRejectedValue(failure);
      await expect(
        f.service.list('owner-a', resourceId, { limit: 25 }),
      ).rejects.toBe(failure);
      expect(f.find).not.toHaveBeenCalled();
    }
  });

  it('rejects bad owner, page limit, resource ID and foreign cursors before resource reads', async () => {
    const f = setup();
    for (const limit of [0, 26, -3, 1.3, Number.NaN]) {
      await expect(
        f.service.list('owner-a', resourceId, { limit }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    await expect(
      f.service.list('', resourceId, { limit: 25 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      f.service.list('owner-a', 'not-uuid', { limit: 25 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    const cursor = encodeMembershipCursor('owner-a', resourceId, {
      id: collectionId,
      updatedAt,
    });
    await expect(
      f.service.list('owner-b', resourceId, { limit: 25, cursor }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(f.get).not.toHaveBeenCalled();
    expect(f.find).not.toHaveBeenCalled();
  });

  it('fails closed on cross-owner, missing resource or corrupt persisted records', async () => {
    for (const invalid of [
      row({ ownerUserId: 'owner-b' }),
      row({ resourceIds: [otherId] }),
      row({ resourceIds: [resourceId, resourceId] }),
      row({ resourceIds: 'not-array' }),
      row({ id: 'bad-id' }),
      row({ title: '' }),
      row({ revision: 0 }),
      row({ updatedAt: new Date(Number.NaN) }),
    ]) {
      const f = setup([invalid]);
      await expect(
        f.service.list('owner-a', resourceId, { limit: 25 }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
  });

  it('rejects an impossible oversized datastore page', async () => {
    const f = setup([row(), row(), row()]);
    await expect(
      f.service.list('owner-a', resourceId, { limit: 1 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('does not disguise Mongo outages as empty memberships', async () => {
    const f = setup();
    f.query.exec.mockRejectedValue(new Error('mongo-unavailable'));
    await expect(
      f.service.list('owner-a', resourceId, { limit: 25 }),
    ).rejects.toThrow('mongo-unavailable');
  });
});
