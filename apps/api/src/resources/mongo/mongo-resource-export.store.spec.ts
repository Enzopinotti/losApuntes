import { MongoResourceExportStore } from './mongo-resource-export.store';

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
    const store = new MongoResourceExportStore(resources as never);

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
    const store = new MongoResourceExportStore(resources as never);

    await expect(
      store.listAuthoredResourcesForExport({
        authorUserId: 'owner-1',
        limit: 100,
      }),
    ).resolves.toEqual({ items: [], hasMore: false });
    expect(resources.find).toHaveBeenCalledWith({ authorUserId: 'owner-1' });
    expect(chain.limit).toHaveBeenCalledWith(101);
  });
});
