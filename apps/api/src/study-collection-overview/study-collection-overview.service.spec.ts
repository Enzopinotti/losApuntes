import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PipelineStage } from 'mongoose';

import { StudyCollectionOverviewService } from './study-collection-overview.service';

const uuid1 = '11111111-1111-4111-8111-111111111111';
const uuid2 = '22222222-2222-4222-8222-222222222222';
const at1 = new Date('2026-10-20T15:00:00.000Z');
const at2 = new Date('2026-10-19T13:00:00.000Z');

function metrics(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    collectionsCount: 3,
    collectionsWithResources: 2,
    fullCollectionsCount: 1,
    storedResourceReferences: 103,
    invalidCollectionsCount: 0,
    ...overrides,
  };
}

function recent(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid1,
    ownerUserId: 'owner-a',
    title: 'Exámenes',
    revision: 3,
    referenceCount: 3,
    updatedAt: at1,
    secret: 'not-for-client',
    ...overrides,
  };
}

function fixture(
  result: unknown = [
    {
      totals: [metrics()],
      recent: [recent(), recent({ id: uuid2, updatedAt: at2 })],
    },
  ],
) {
  const exec = jest.fn().mockResolvedValue(result);
  let lastPipeline: PipelineStage[] | undefined;
  const aggregate = jest.fn((pipeline: PipelineStage[]) => {
    lastPipeline = pipeline;
    return { exec };
  });
  const overview = new StudyCollectionOverviewService({ aggregate } as never);
  return { overview, exec, aggregate, getPipeline: () => lastPipeline };
}

describe('B152 study collection overview owner-only aggregation', () => {
  it('creates owner-scoped indexed aggregation before any stats or recent item', async () => {
    const f = fixture();
    const result = await f.overview.get('owner-a');
    expect(f.aggregate).toHaveBeenCalledTimes(1);
    const pipeline = f.getPipeline();
    expect(pipeline?.[0]).toEqual({ $match: { ownerUserId: 'owner-a' } });
    expect(pipeline?.[1]).toEqual({ $sort: { updatedAt: -1, id: 1 } });
    expect(pipeline?.[2]).toHaveProperty('$project');
    const facet = (
      pipeline?.[3] as {
        $facet: { totals: unknown[]; recent: unknown[] };
      }
    ).$facet;
    expect(
      facet.totals.some(
        (stage) =>
          typeof stage === 'object' && stage !== null && '$group' in stage,
      ),
    ).toBe(true);
    expect(facet.recent[0]).toEqual({ $limit: 5 });
    expect(facet.recent[1]).toHaveProperty('$project');
    expect(result).toEqual({
      collectionsCount: 3,
      collectionsWithResources: 2,
      fullCollectionsCount: 1,
      storedResourceReferences: 103,
      recentCollections: [
        {
          id: uuid1,
          title: 'Exámenes',
          resourceCount: 3,
          revision: 3,
          updatedAt: at1.toISOString(),
        },
        {
          id: uuid2,
          title: 'Exámenes',
          resourceCount: 3,
          revision: 3,
          updatedAt: at2.toISOString(),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('owner-a');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(f.exec).toHaveBeenCalledTimes(1);
  });

  it('returns a valid zero overview when the authenticated user has no collections', async () => {
    const f = fixture([{ totals: [], recent: [] }]);
    await expect(f.overview.get('empty-account')).resolves.toEqual({
      collectionsCount: 0,
      collectionsWithResources: 0,
      fullCollectionsCount: 0,
      storedResourceReferences: 0,
      recentCollections: [],
    });
    expect(f.getPipeline()?.[0]).toEqual({
      $match: { ownerUserId: 'empty-account' },
    });
  });

  it('rejects absent principals before performing any database query', async () => {
    const f = fixture();
    for (const owner of ['', '   ']) {
      await expect(f.overview.get(owner)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    }
    expect(f.aggregate).not.toHaveBeenCalled();
  });

  it('fails closed for impossible output structures and unexpected facets', async () => {
    for (const invalid of [
      [],
      null,
      [
        { totals: [], recent: [] },
        { totals: [], recent: [] },
      ],
      [{ totals: null, recent: [] }],
      [{ totals: [], recent: null }],
      [{ totals: [metrics(), metrics()], recent: [] }],
      [{ totals: [metrics()], recent: Array(6).fill(recent()) }],
    ]) {
      const f = fixture(invalid);
      await expect(f.overview.get('owner-a')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('detects invalid totals instead of returning misleading metrics', async () => {
    for (const broken of [
      { collectionsCount: -1 },
      { collectionsCount: '3' },
      { collectionsCount: 0 },
      { collectionsWithResources: 4 },
      { collectionsWithResources: -1 },
      { fullCollectionsCount: 3 },
      { storedResourceReferences: 1 },
      { storedResourceReferences: 301 },
      { storedResourceReferences: Number.NaN },
      { invalidCollectionsCount: 1 },
      { invalidCollectionsCount: -1 },
    ]) {
      const f = fixture([{ totals: [metrics(broken)], recent: [recent()] }]);
      await expect(f.overview.get('owner-a')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('rejects crossed owner, duplicate IDs and corrupted recent collection fields', async () => {
    for (const bad of [
      { ownerUserId: 'other-account' },
      { id: 'not-a-uuid' },
      { title: '' },
      { title: 'a'.repeat(101) },
      { revision: 0 },
      { revision: 1.2 },
      { referenceCount: 101 },
      { referenceCount: -1 },
      { updatedAt: 'not-a-date' },
      { updatedAt: new Date(Number.NaN) },
    ]) {
      const f = fixture([{ totals: [metrics()], recent: [recent(bad)] }]);
      await expect(f.overview.get('owner-a')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }

    const duplicates = fixture([
      { totals: [metrics()], recent: [recent(), recent()] },
    ]);
    await expect(duplicates.overview.get('owner-a')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects a nonzero total with no recent items', async () => {
    const f = fixture([{ totals: [metrics()], recent: [] }]);
    await expect(f.overview.get('owner-a')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not replace database errors with zero statistics', async () => {
    const f = fixture();
    f.exec.mockRejectedValue(new Error('mongo-disconnected'));
    await expect(f.overview.get('owner-a')).rejects.toThrow(
      'mongo-disconnected',
    );
  });
});
