import { MongoResourceExportStore } from './mongo-resource-export.store';

function query<T>(rows: T[]) {
  const chain = {
    select: jest.fn(),
    sort: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(rows),
  };
  chain.select.mockReturnValue(chain);
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

describe('MongoResourceExportStore', () => {
  it('selects only exportable Resource metadata and reads a bounded id-ordered page', async () => {
    const rows = [
      {
        id: 'resource-a',
        title: 'A',
        description: null,
        tags: [],
        subjectId: 'subject-a',
        courseOfferingId: null,
        visibility: 'private',
        moderationState: 'hidden',
        revision: 1,
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      },
      {
        id: 'resource-b',
        title: 'B',
        description: 'description',
        tags: ['tag'],
        subjectId: 'subject-b',
        courseOfferingId: 'offering-b',
        visibility: 'shared',
        moderationState: 'available',
        revision: 2,
        createdAt: new Date('2026-10-02T00:00:00.000Z'),
        updatedAt: new Date('2026-10-03T00:00:00.000Z'),
      },
      {
        id: 'resource-c',
        title: 'C',
        description: null,
        tags: [],
        subjectId: 'subject-c',
        courseOfferingId: null,
        visibility: 'public',
        moderationState: 'available',
        revision: 1,
        createdAt: new Date('2026-10-04T00:00:00.000Z'),
        updatedAt: new Date('2026-10-05T00:00:00.000Z'),
      },
    ];
    const chain = {
      select: jest.fn(),
      sort: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue(rows),
    };
    chain.select.mockReturnValue(chain);
    chain.sort.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    const resources = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoResourceExportStore(
      resources as never,
      {} as never,
      {} as never,
    );

    await expect(
      store.listAuthoredResourcesForExport({
        authorUserId: 'owner-1',
        limit: 2,
        afterId: 'resource-0',
      }),
    ).resolves.toEqual({ items: rows.slice(0, 2), hasMore: true });

    expect(resources.find).toHaveBeenCalledWith({
      authorUserId: 'owner-1',
      id: { $gt: 'resource-0' },
    });
    expect(chain.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      title: 1,
      description: 1,
      tags: 1,
      subjectId: 1,
      courseOfferingId: 1,
      visibility: 1,
      moderationState: 1,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(chain.sort).toHaveBeenCalledWith({ id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(3);
  });

  it('starts at the first Resource id when the cursor is absent', async () => {
    const chain = {
      select: jest.fn(),
      sort: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    chain.select.mockReturnValue(chain);
    chain.sort.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    const resources = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoResourceExportStore(
      resources as never,
      {} as never,
      {} as never,
    );

    await expect(
      store.listAuthoredResourcesForExport({
        authorUserId: 'owner-1',
        limit: 100,
      }),
    ).resolves.toEqual({ items: [], hasMore: false });
    expect(resources.find).toHaveBeenCalledWith({ authorUserId: 'owner-1' });
    expect(chain.limit).toHaveBeenCalledWith(101);
  });

  it('advances past a bounded Resource batch when it contains no explicit grants', async () => {
    const resourceChain = query([
      { id: 'resource-a' },
      { id: 'resource-b' },
      { id: 'resource-c' },
    ]);
    const shareChain = query([]);
    const resources = { find: jest.fn().mockReturnValue(resourceChain) };
    const shares = { find: jest.fn().mockReturnValue(shareChain) };
    const store = new MongoResourceExportStore(
      resources as never,
      shares as never,
      {} as never,
    );

    await expect(
      store.listAuthoredResourceShareGrantsForExport({
        authorUserId: 'owner-1',
        limit: 2,
      }),
    ).resolves.toEqual({
      items: [],
      nextCursor: { resourceId: 'resource-b' },
    });

    expect(resources.find).toHaveBeenCalledWith({ authorUserId: 'owner-1' });
    expect(resourceChain.select).toHaveBeenCalledWith({ _id: 0, id: 1 });
    expect(resourceChain.sort).toHaveBeenCalledWith({ id: 1 });
    expect(resourceChain.limit).toHaveBeenCalledWith(3);
    expect(shares.find).toHaveBeenCalledWith({
      resourceId: { $in: ['resource-a', 'resource-b'] },
    });
    expect(shareChain.select).toHaveBeenCalledWith({
      _id: 0,
      resourceId: 1,
      userId: 1,
      createdAt: 1,
    });
    expect(shareChain.sort).toHaveBeenCalledWith({ resourceId: 1, userId: 1 });
    expect(shareChain.limit).toHaveBeenCalledWith(3);
  });

  it('continues within a Resource then orders later grants by recipient id', async () => {
    const resourceChain = query([
      { id: 'resource-a' },
      { id: 'resource-b' },
      { id: 'resource-c' },
    ]);
    const shareChain = query([
      {
        resourceId: 'resource-a',
        userId: 'grantee-b',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
      },
      {
        resourceId: 'resource-b',
        userId: 'grantee-c',
        createdAt: new Date('2026-10-02T00:00:00.000Z'),
      },
      {
        resourceId: 'resource-b',
        userId: 'grantee-d',
        createdAt: new Date('2026-10-03T00:00:00.000Z'),
      },
    ]);
    const resources = { find: jest.fn().mockReturnValue(resourceChain) };
    const shares = { find: jest.fn().mockReturnValue(shareChain) };
    const store = new MongoResourceExportStore(
      resources as never,
      shares as never,
      {} as never,
    );

    await expect(
      store.listAuthoredResourceShareGrantsForExport({
        authorUserId: 'owner-1',
        limit: 2,
        after: { resourceId: 'resource-a', granteeUserId: 'grantee-a' },
      }),
    ).resolves.toEqual({
      items: [
        {
          resourceId: 'resource-a',
          granteeUserId: 'grantee-b',
          grantedAt: new Date('2026-10-01T00:00:00.000Z'),
        },
        {
          resourceId: 'resource-b',
          granteeUserId: 'grantee-c',
          grantedAt: new Date('2026-10-02T00:00:00.000Z'),
        },
      ],
      nextCursor: { resourceId: 'resource-b', granteeUserId: 'grantee-c' },
    });

    expect(resources.find).toHaveBeenCalledWith({
      authorUserId: 'owner-1',
      id: { $gte: 'resource-a' },
    });
    expect(shares.find).toHaveBeenCalledWith({
      resourceId: { $in: ['resource-a', 'resource-b'] },
      $or: [
        {
          resourceId: 'resource-a',
          userId: { $gt: 'grantee-a' },
        },
        { resourceId: { $gt: 'resource-a' } },
      ],
    });
  });

  it('projects exact-owner Resource reports with stable bounded id pagination', async () => {
    const rows = [
      {
        id: 'resource-report-a',
        resourceId: 'resource-ref-a',
        reason: 'copyright',
        details: null,
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        status: 'pending',
        reviewedByUserId: 'moderator',
      },
      {
        id: 'resource-report-b',
        resourceId: 'resource-ref-b',
        reason: 'other',
        details: 'Owner text',
        createdAt: new Date('2026-10-02T00:00:00.000Z'),
      },
      {
        id: 'resource-report-c',
        resourceId: 'resource-ref-c',
        reason: 'spam',
        details: null,
        createdAt: new Date('2026-10-03T00:00:00.000Z'),
      },
    ];
    const chain = query(rows);
    const reports = { find: jest.fn().mockReturnValue(chain) };
    const store = new MongoResourceExportStore(
      {} as never,
      {} as never,
      reports as never,
    );

    await expect(
      store.listSubmittedReportsForExport({
        reporterUserId: 'owner-1',
        limit: 2,
        afterId: 'resource-report-before',
      }),
    ).resolves.toEqual({ items: rows.slice(0, 2), hasMore: true });

    expect(reports.find).toHaveBeenCalledWith({
      reporterUserId: 'owner-1',
      id: { $gt: 'resource-report-before' },
    });
    expect(chain.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      resourceId: 1,
      reason: 1,
      details: 1,
      createdAt: 1,
    });
    expect(chain.sort).toHaveBeenCalledWith({ id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(3);
  });
});
