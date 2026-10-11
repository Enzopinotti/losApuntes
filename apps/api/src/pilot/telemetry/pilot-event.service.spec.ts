import type { PilotEventStore } from './pilot-event.store';
import { PilotEventService } from './pilot-event.service';

describe('PilotEventService', () => {
  it('persists only the allowlisted event payload supplied by the server', async () => {
    const store: jest.Mocked<PilotEventStore> = {
      create: jest.fn().mockResolvedValue(undefined),
      listForAccountExport: jest.fn().mockResolvedValue({
        items: [],
        hasMore: false,
      }),
    };
    const service = new PilotEventService(store);
    const now = new Date('2026-09-23T18:00:00.000Z');

    await service.record({
      event: 'pilot.search_performed',
      userId: 'user-1',
      subjectId: 'subject-1',
      resultCount: 0,
      now,
    });

    expect(store.create.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        event: 'pilot.search_performed',
        userId: 'user-1',
        subjectId: 'subject-1',
        resultCount: 0,
        createdAt: now,
      }),
    );
    expect(store.create.mock.calls[0]?.[0]).not.toHaveProperty('query');
    expect(store.create.mock.calls[0]?.[0]).not.toHaveProperty('content');
  });

  it('omits undefined optional dimensions', async () => {
    const store: jest.Mocked<PilotEventStore> = {
      create: jest.fn().mockResolvedValue(undefined),
      listForAccountExport: jest.fn().mockResolvedValue({
        items: [],
        hasMore: false,
      }),
    };
    const service = new PilotEventService(store);

    await service.record({
      event: 'pilot.home_viewed',
    });

    const row = store.create.mock.calls[0]?.[0];
    expect(row).not.toHaveProperty('userId');
    expect(row).not.toHaveProperty('subjectId');
    expect(row).not.toHaveProperty('resultCount');
  });

  it('swallows telemetry persistence failures in best-effort mode', async () => {
    const store: jest.Mocked<PilotEventStore> = {
      create: jest.fn().mockRejectedValue(new Error('telemetry unavailable')),
      listForAccountExport: jest.fn().mockResolvedValue({
        items: [],
        hasMore: false,
      }),
    };
    const service = new PilotEventService(store);

    await expect(
      service.recordBestEffort({
        event: 'pilot.resource_created',
        userId: 'user-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('returns a section-bound opaque cursor from the last emitted row', async () => {
    const createdAt = new Date('2026-10-11T12:00:00.000Z');
    const store: jest.Mocked<PilotEventStore> = {
      create: jest.fn().mockResolvedValue(undefined),
      listForAccountExport: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'event-1',
            event: 'pilot.home_viewed',
            createdAt,
          },
        ],
        hasMore: true,
      }),
    };
    const service = new PilotEventService(store);

    const page = await service.listForAccountExport({
      userId: 'owner-user',
      cursor: null,
      limit: 1,
    });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    const payload = JSON.parse(
      Buffer.from(page.nextCursor ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(payload).toEqual({
      section: 'pilot.activity',
      version: 1,
      createdAt: createdAt.toISOString(),
      id: 'event-1',
    });

    store.listForAccountExport.mockResolvedValueOnce({
      items: [],
      hasMore: false,
    });
    await service.listForAccountExport({
      userId: 'owner-user',
      cursor: page.nextCursor,
      limit: 1,
    });
    expect(store.listForAccountExport.mock.calls[1]?.[0].after).toEqual({
      createdAt,
      id: 'event-1',
    });
  });

  it('rejects invalid cursors and page limits before querying the store', async () => {
    const store: jest.Mocked<PilotEventStore> = {
      create: jest.fn().mockResolvedValue(undefined),
      listForAccountExport: jest.fn().mockResolvedValue({
        items: [],
        hasMore: false,
      }),
    };
    const service = new PilotEventService(store);

    await expect(
      service.listForAccountExport({
        userId: 'owner-user',
        cursor: Buffer.from(
          JSON.stringify({
            section: 'other.section',
            version: 1,
            createdAt: '2026-10-11T12:00:00.000Z',
            id: 'event-1',
          }),
        ).toString('base64url'),
        limit: 1,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PILOT_EVENT_ACCOUNT_EXPORT_CURSOR_INVALID' },
    });
    await expect(
      service.listForAccountExport({
        userId: 'owner-user',
        cursor: null,
        limit: 101,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PILOT_EVENT_ACCOUNT_EXPORT_LIMIT_INVALID' },
    });
    expect(store.listForAccountExport.mock).not.toHaveBeenCalled();
  });
});
