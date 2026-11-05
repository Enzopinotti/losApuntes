import {
  RequestTimeoutException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PipelineStage } from 'mongoose';

import { ResourceSavedOverviewService } from './resource-saved-overview.service';

const resourceA = '11111111-1111-4111-8111-111111111111';
const resourceB = '22222222-2222-4222-8222-222222222222';
const savedAt = new Date('2026-10-20T12:00:00.000Z');
const earlier = new Date('2026-10-19T15:00:00.000Z');

function recent(overrides: Record<string, unknown> = {}) {
  return {
    resourceId: resourceA,
    title: 'Introducción a Álgebra',
    subjectId: '33333333-3333-4333-8333-333333333333',
    savedAt,
    secret: 'must-not-leak',
    ...overrides,
  };
}

function facets(
  savedResourcesCount = 2,
  subjectsCount = 1,
  rows: unknown[] = [
    recent(),
    recent({ resourceId: resourceB, savedAt: earlier }),
  ],
) {
  return [
    {
      totals: savedResourcesCount ? [{ count: savedResourcesCount }] : [],
      subjects: subjectsCount ? [{ count: subjectsCount }] : [],
      recent: rows,
    },
  ];
}

function fixture(result: unknown = facets()) {
  const exec = jest.fn().mockResolvedValue(result);
  const option = jest.fn().mockReturnValue({ exec });
  let pipeline: PipelineStage[] | undefined;
  const aggregate = jest.fn((stages: PipelineStage[]) => {
    pipeline = stages;
    return { option };
  });
  const service = new ResourceSavedOverviewService({
    aggregate,
  } as never);
  return {
    service,
    aggregate,
    option,
    exec,
    pipeline: () => pipeline,
  };
}

describe('B154 private saved library overview', () => {
  it('counts only saved rows after current resource and share authorization', async () => {
    const f = fixture();
    const result = await f.service.get('owner-a');
    const pipeline = f.pipeline();
    expect(pipeline?.[0]).toEqual({ $match: { userId: 'owner-a' } });
    expect(pipeline?.[1]).toEqual({
      $project: { _id: 0, resourceId: 1, createdAt: 1 },
    });
    const lookups = pipeline?.filter((stage) => '$lookup' in stage);
    expect(lookups).toHaveLength(2);
    expect(lookups?.[0]).toMatchObject({
      $lookup: {
        from: 'resources',
        localField: 'resourceId',
        foreignField: 'id',
      },
    });
    expect(lookups?.[1]).toMatchObject({
      $lookup: {
        from: 'resource_shares',
        localField: 'resourceId',
        foreignField: 'resourceId',
      },
    });
    const facet = pipeline?.at(-1);
    expect(facet).toHaveProperty('$facet');
    const filters = pipeline?.filter((stage) => '$match' in stage);
    expect(filters?.length).toBeGreaterThanOrEqual(2);
    expect(lookups?.[0]).toMatchObject({
      $lookup: {
        pipeline: [
          { $match: { moderationState: 'available' } },
          expect.anything(),
        ],
      },
    });
    expect(lookups?.[1]).toMatchObject({
      $lookup: {
        pipeline: [
          { $match: { userId: 'owner-a' } },
          { $limit: 1 },
          expect.anything(),
        ],
      },
    });
    expect(f.option).toHaveBeenCalledWith({
      allowDiskUse: true,
      maxTimeMS: 8000,
    });
    expect(result).toEqual({
      savedResourcesCount: 2,
      subjectsCount: 1,
      recentSavedResources: [
        {
          resourceId: resourceA,
          title: 'Introducción a Álgebra',
          subjectId: '33333333-3333-4333-8333-333333333333',
          savedAt: savedAt.toISOString(),
        },
        {
          resourceId: resourceB,
          title: 'Introducción a Álgebra',
          subjectId: '33333333-3333-4333-8333-333333333333',
          savedAt: earlier.toISOString(),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('owner-a');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(f.exec).toHaveBeenCalledTimes(1);
  });

  it('uses distinct subject aggregation and a five-save recent limit', async () => {
    const f = fixture(facets(0, 0, []));
    await f.service.get('owner-a');
    const facetsStage = f.pipeline()?.at(-1) as {
      $facet: {
        totals: unknown[];
        subjects: unknown[];
        recent: unknown[];
      };
    };
    expect(facetsStage.$facet.totals).toEqual([{ $count: 'count' }]);
    expect(facetsStage.$facet.subjects).toEqual([
      { $group: { _id: '$__resource.subjectId' } },
      { $count: 'count' },
    ]);
    expect(facetsStage.$facet.recent).toEqual([
      { $sort: { createdAt: -1, resourceId: 1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          resourceId: 1,
          title: '$__resource.title',
          subjectId: '$__resource.subjectId',
          savedAt: '$createdAt',
        },
      },
    ]);
  });

  it('returns the empty account overview with actual zeroes', async () => {
    const f = fixture(facets(0, 0, []));
    await expect(f.service.get('empty-owner')).resolves.toEqual({
      savedResourcesCount: 0,
      subjectsCount: 0,
      recentSavedResources: [],
    });
    expect(f.pipeline()?.[0]).toEqual({
      $match: { userId: 'empty-owner' },
    });
  });

  it('rejects missing authenticated owner before issuing any Mongo query', async () => {
    const f = fixture();
    for (const userId of ['', '   ']) {
      await expect(f.service.get(userId)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    }
    expect(f.aggregate).not.toHaveBeenCalled();
  });

  it('rejects structurally corrupt facets and oversized recent pages', async () => {
    for (const result of [
      null,
      [],
      [facets()[0], facets()[0]],
      [{ totals: null, subjects: [], recent: [] }],
      [{ totals: [], subjects: null, recent: [] }],
      [{ totals: [], subjects: [], recent: null }],
      [
        {
          totals: [{ count: 1 }, { count: 2 }],
          subjects: [],
          recent: [],
        },
      ],
      [
        {
          totals: [{ count: 2 }],
          subjects: [{ count: 1 }, { count: 2 }],
          recent: [],
        },
      ],
      facets(6, 2, Array(6).fill(recent())),
    ]) {
      const f = fixture(result);
      await expect(f.service.get('owner-a')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('rejects impossible totals and missing recent authorized saves', async () => {
    for (const result of [
      facets(-1, 0, []),
      facets(1, 2, [recent()]),
      facets(1, 0, [recent()]),
      facets(2, 1, [recent()]),
      facets(0, 0, [recent()]),
      [
        {
          totals: [{ count: '2' }],
          subjects: [{ count: 1 }],
          recent: [],
        },
      ],
      [
        {
          totals: [{ count: 2.5 }],
          subjects: [{ count: 1 }],
          recent: [],
        },
      ],
    ]) {
      const f = fixture(result);
      await expect(f.service.get('owner-a')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('rejects foreign fields, malformed rows and duplicate resources', async () => {
    for (const broken of [
      { resourceId: 'not-a-uuid' },
      { subjectId: '' },
      { subjectId: null },
      { title: '' },
      { title: null },
      { savedAt: 'not-a-date' },
      { savedAt: new Date(Number.NaN) },
    ]) {
      const f = fixture(facets(1, 1, [recent(broken)]));
      await expect(f.service.get('owner-a')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
    const duplicates = fixture(
      facets(2, 1, [recent(), recent({ savedAt: earlier })]),
    );
    await expect(duplicates.service.get('owner-a')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects misordered timestamps and ascending ID ties', async () => {
    for (const rows of [
      [recent({ savedAt: earlier }), recent({ resourceId: resourceB })],
      [recent({ resourceId: resourceB }), recent({ resourceId: resourceA })],
    ]) {
      const f = fixture(facets(2, 1, rows));
      await expect(f.service.get('owner-a')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('maps Mongo execution deadlines to bounded saved-library timeout', async () => {
    const f = fixture();
    f.exec.mockRejectedValue({ code: 50, codeName: 'MaxTimeMSExpired' });
    await expect(f.service.get('owner-a')).rejects.toBeInstanceOf(
      RequestTimeoutException,
    );
  });

  it('does not replace Mongo outages with an empty overview', async () => {
    const f = fixture();
    f.exec.mockRejectedValue(new Error('mongo-offline'));
    await expect(f.service.get('owner-a')).rejects.toThrow('mongo-offline');
  });
});
