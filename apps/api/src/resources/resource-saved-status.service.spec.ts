import {
  RequestTimeoutException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PipelineStage } from 'mongoose';

import { ResourceSavedStatusService } from './resource-saved-status.service';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const third = '33333333-3333-4333-8333-333333333333';

function fixture(result: unknown = [{ resourceId: first }]) {
  const exec = jest.fn().mockResolvedValue(result);
  const option = jest.fn().mockReturnValue({ exec });
  let capturedPipeline: PipelineStage[] | undefined;
  const aggregate = jest.fn((pipeline: PipelineStage[]) => {
    capturedPipeline = pipeline;
    return { option };
  });
  const service = new ResourceSavedStatusService({ aggregate } as never);
  return {
    service,
    aggregate,
    option,
    exec,
    pipeline: () => capturedPipeline,
  };
}

describe('B155 owner-safe batch bookmark status', () => {
  it('applies owner and requested IDs before visibility/moderation joins', async () => {
    const f = fixture([{ resourceId: first }, { resourceId: third }]);
    const result = await f.service.check('owner-a', [third, second, first]);
    const pipeline = f.pipeline();

    expect(pipeline?.[0]).toEqual({
      $match: {
        userId: 'owner-a',
        resourceId: { $in: [third, second, first] },
      },
    });
    expect(pipeline?.[1]).toEqual({
      $project: { _id: 0, resourceId: 1 },
    });
    expect(pipeline?.[2]).toMatchObject({
      $lookup: {
        from: 'resources',
        localField: 'resourceId',
        foreignField: 'id',
        pipeline: [
          { $match: { moderationState: 'available' } },
          expect.anything(),
        ],
      },
    });
    expect(pipeline?.[4]).toMatchObject({
      $lookup: {
        from: 'resource_shares',
        localField: 'resourceId',
        foreignField: 'resourceId',
        pipeline: [
          { $match: { userId: 'owner-a' } },
          { $limit: 1 },
          expect.anything(),
        ],
      },
    });
    expect(pipeline?.[5]).toEqual({
      $match: {
        $or: [
          { '__resource.visibility': 'public' },
          { '__resource.authorUserId': 'owner-a' },
          {
            $and: [
              { '__resource.visibility': 'shared' },
              { '__viewerShares.0': { $exists: true } },
            ],
          },
        ],
      },
    });
    expect(pipeline?.[6]).toEqual({ $limit: 4 });
    expect(pipeline?.[7]).toEqual({
      $project: { _id: 0, resourceId: 1 },
    });
    expect(f.option).toHaveBeenCalledWith({ maxTimeMS: 8000 });
    expect(f.aggregate).toHaveBeenCalledTimes(1);
    expect(f.exec).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      items: [
        { resourceId: third, isSaved: true },
        { resourceId: second, isSaved: false },
        { resourceId: first, isSaved: true },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('owner-a');
  });

  it('indistinguishably returns false for unsaved or no-longer-readable saves', async () => {
    const f = fixture([]);
    await expect(f.service.check('owner-a', [first, second])).resolves.toEqual({
      items: [
        { resourceId: first, isSaved: false },
        { resourceId: second, isSaved: false },
      ],
    });
  });

  it('permits one ID and the maximum of fifty distinct identifiers', async () => {
    const f = fixture([]);
    await expect(f.service.check('owner-a', [first])).resolves.toEqual({
      items: [{ resourceId: first, isSaved: false }],
    });
    const ids = Array.from(
      { length: 50 },
      (_, index) =>
        `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
    );
    const rows = await f.service.check('owner-a', ids);
    expect(rows.items).toHaveLength(50);
    expect(rows.items[49]).toEqual({
      resourceId: ids[49],
      isSaved: false,
    });
    expect(f.pipeline()?.[6]).toEqual({ $limit: 51 });
  });

  it('rejects invalid owner, bad shapes, duplicated or too many IDs before Mongo', async () => {
    const f = fixture([]);
    for (const input of [
      [],
      [first, first],
      [first, 'not-uuid'],
      ['11111111-1111-1111-8111-111111111111'],
      [1],
      Array(51).fill(first),
      'not-array',
      null,
      {},
    ]) {
      await expect(
        f.service.check('owner-a', input as string[]),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    for (const owner of ['', '   ']) {
      await expect(f.service.check(owner, [first])).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    }
    expect(f.aggregate).not.toHaveBeenCalled();
  });

  it('fails closed for unexpected, duplicate, malformed or oversized Mongo matches', async () => {
    for (const bad of [
      null,
      {},
      [{ resourceId: third }],
      [{ resourceId: first }, { resourceId: first }],
      [{ resourceId: first }, { resourceId: second }],
      [{ resourceId: 'not-uuid' }],
      [{ resourceId: 7 }],
      [null],
    ]) {
      const f = fixture(bad);
      await expect(f.service.check('owner-a', [first])).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('does not leak extra database attributes in output', async () => {
    const f = fixture([
      {
        resourceId: first,
        userId: 'internal-account',
        authorUserId: 'other-account',
        visibility: 'shared',
        secret: 'never-echo-this',
      },
    ]);
    const result = await f.service.check('owner-a', [first]);
    expect(result).toEqual({
      items: [{ resourceId: first, isSaved: true }],
    });
    expect(JSON.stringify(result)).not.toContain('internal-account');
    expect(JSON.stringify(result)).not.toContain('never-echo-this');
  });

  it('converts Mongo execution deadline into the existing saved search timeout', async () => {
    const f = fixture();
    f.exec.mockRejectedValue({ code: 50, codeName: 'MaxTimeMSExpired' });
    await expect(f.service.check('owner-a', [first])).rejects.toBeInstanceOf(
      RequestTimeoutException,
    );
  });

  it('propagates genuine Mongo outages instead of returning all false', async () => {
    const f = fixture();
    f.exec.mockRejectedValue(new Error('mongo-offline'));
    await expect(f.service.check('owner-a', [first])).rejects.toThrow(
      'mongo-offline',
    );
  });
});
