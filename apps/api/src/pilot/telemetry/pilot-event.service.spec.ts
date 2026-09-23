import type { PilotEventStore } from './pilot-event.store';
import { PilotEventService } from './pilot-event.service';

describe('PilotEventService', () => {
  it('persists only the allowlisted event payload supplied by the server', async () => {
    const store: jest.Mocked<PilotEventStore> = {
      create: jest.fn().mockResolvedValue(undefined),
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

    expect(store.create).toHaveBeenCalledWith(
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
    };
    const service = new PilotEventService(store);

    await expect(
      service.recordBestEffort({
        event: 'pilot.resource_created',
        userId: 'user-1',
      }),
    ).resolves.toBeUndefined();
  });
});
