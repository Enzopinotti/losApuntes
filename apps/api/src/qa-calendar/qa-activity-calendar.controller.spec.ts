import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { QaActivityCalendarController } from './qa-activity-calendar.controller';
import type { QaActivityCalendarService } from './qa-activity-calendar.service';

describe('B165 private Q&A calendar HTTP route', () => {
  it('requires the session and prevents shared caching of owner activity', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, QaActivityCalendarController),
    ).toBe('qa/me');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, QaActivityCalendarController),
    ).toEqual([AuthSessionGuard]);

    const handler = Reflect.get(
      QaActivityCalendarController.prototype,
      'getCalendar',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'activity-calendar',
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('never takes the account from body, query or route parameters', async () => {
    const expected = {
      asOfUtc: '2026-10-20T01:00:00.000Z',
      windowStartUtc: '2026-09-23T00:00:00.000Z',
      windowEndUtcExclusive: '2026-10-21T00:00:00.000Z',
      days: [],
    };
    const forOwner = jest.fn().mockResolvedValue(expected);
    const controller = new QaActivityCalendarController({
      forOwner,
    } as unknown as QaActivityCalendarService);

    await expect(
      controller.getCalendar({
        user: { id: 'session-owner' },
        query: { userId: 'unrelated-account' },
        body: { ownerId: 'unrelated-account' },
      } as unknown as AuthenticatedRequest),
    ).resolves.toEqual(expected);
    expect(forOwner).toHaveBeenCalledTimes(1);
    expect(forOwner).toHaveBeenCalledWith('session-owner');
  });
});
