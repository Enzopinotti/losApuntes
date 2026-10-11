import type { PilotEventAccountExportRecord } from '../pilot-event.types';
import { MongoPilotEventStore } from './mongo-pilot-event.store';
import { PilotEventSchema } from './pilot-event.mongo-schema';

const now = new Date('2026-10-11T12:00:00.000Z');

describe('MongoPilotEventStore account export', () => {
  it('filters by exact owner and stable keyset, selecting only portable fields', async () => {
    const first: PilotEventAccountExportRecord = {
      id: 'event-1',
      event: 'pilot.home_viewed',
      createdAt: now,
    };
    const chain = {
      select: jest.fn(),
      sort: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([first, { ...first, id: 'event-2' }]),
    };
    chain.select.mockReturnValue(chain);
    chain.sort.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    const events = { find: jest.fn(() => chain) };
    const store = new MongoPilotEventStore(events as never);

    await expect(
      store.listForAccountExport({
        userId: 'owner-user',
        limit: 1,
        after: { createdAt: now, id: 'event-0' },
      }),
    ).resolves.toEqual({ items: [first], hasMore: true });

    expect(events.find).toHaveBeenCalledWith({
      userId: 'owner-user',
      $or: [
        { createdAt: { $gt: now } },
        { createdAt: now, id: { $gt: 'event-0' } },
      ],
    });
    expect(chain.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      event: 1,
      subjectId: 1,
      resultCount: 1,
      createdAt: 1,
    });
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: 1, id: 1 });
    expect(chain.limit).toHaveBeenCalledWith(2);
  });

  it('caps the persistence read at the account export maximum', async () => {
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
    const events = { find: jest.fn(() => chain) };
    const store = new MongoPilotEventStore(events as never);

    await store.listForAccountExport({ userId: 'owner-user', limit: 10_000 });

    expect(chain.limit).toHaveBeenCalledWith(101);
  });

  it('has the owner and export-order compound index', () => {
    expect(PilotEventSchema.indexes()).toContainEqual([
      { userId: 1, createdAt: 1, id: 1 },
      { background: true },
    ]);
  });
});
