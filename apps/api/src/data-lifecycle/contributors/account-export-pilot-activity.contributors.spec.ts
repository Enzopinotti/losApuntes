import type { PilotEventService } from '../../pilot/telemetry/pilot-event.service';
import { PilotActivityExportContributor } from './account-export-pilot-activity.contributors';

describe('Pilot activity account export contributor', () => {
  it('exports only the owner activity allowlist and normalizes missing dimensions', async () => {
    const listForAccountExport = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'event-id',
          event: 'pilot.search_performed',
          resultCount: 0,
          createdAt: new Date('2026-10-11T12:00:00.000Z'),
        },
      ],
      nextCursor: 'opaque-next',
    });
    const pilotEvents = {
      listForAccountExport,
    } as unknown as jest.Mocked<PilotEventService>;

    const page = await new PilotActivityExportContributor(pilotEvents).readPage(
      {
        userId: 'owner-user',
        cursor: null,
        limit: 100,
      },
    );

    expect(page).toEqual({
      records: [
        {
          id: 'event-id',
          event: 'pilot.search_performed',
          subjectId: null,
          resultCount: 0,
          createdAt: '2026-10-11T12:00:00.000Z',
        },
      ],
      nextCursor: 'opaque-next',
    });
    for (const key of [
      'userId',
      'subjectUserId',
      'query',
      'content',
      'email',
      'ip',
      'userAgent',
      '_id',
    ]) {
      expect(page.records[0]).not.toHaveProperty(key);
    }
    expect(listForAccountExport).toHaveBeenCalledWith({
      userId: 'owner-user',
      cursor: null,
      limit: 100,
    });
  });
});
