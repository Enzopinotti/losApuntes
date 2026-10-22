import { ServiceUnavailableException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import type { ConfigService } from '@nestjs/config';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyProgressFeatureGuard } from '../study-progress/study-progress.feature.guard';
import { StudyCalendarController } from './study-calendar.controller';
import type { StudyCalendarService } from './study-calendar.service';

describe('B173 private ICS download HTTP contract', () => {
  it('requires revocable session and existing study progress feature gate', () => {
    expect(Reflect.getMetadata(PATH_METADATA, StudyCalendarController)).toBe(
      'study-progress/me',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudyCalendarController),
    ).toEqual([AuthSessionGuard, StudyProgressFeatureGuard]);

    const handler = Reflect.get(
      StudyCalendarController.prototype,
      'exportCalendar',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('calendar.ics');
    const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as Array<{
      name: string;
      value: string;
    }>;
    expect(headers).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
    expect(headers).toContainEqual({
      name: 'Content-Type',
      value: 'text/calendar; charset=utf-8',
    });
    expect(headers).toContainEqual({
      name: 'Content-Disposition',
      value: 'attachment; filename="los-apuntes-sesiones.ics"',
    });
    expect(headers).toContainEqual({
      name: 'X-Content-Type-Options',
      value: 'nosniff',
    });
  });

  it('uses only the authenticated owner, never query or body user IDs', async () => {
    const forOwner = jest.fn().mockResolvedValue('BEGIN:VCALENDAR\r\n');
    const controller = new StudyCalendarController({
      forOwner,
    } as unknown as StudyCalendarService);
    const response = await controller.exportCalendar({
      user: { id: 'current-student' },
      query: { ownerUserId: 'other-student' },
      body: { userId: 'other-student' },
    } as unknown as AuthenticatedRequest);
    expect(response).toBe('BEGIN:VCALENDAR\r\n');
    expect(forOwner).toHaveBeenCalledTimes(1);
    expect(forOwner).toHaveBeenCalledWith('current-student');
  });

  it('fails closed when study progress is disabled', () => {
    const get = jest.fn().mockReturnValue(false);
    const guard = new StudyProgressFeatureGuard({
      get,
    } as unknown as ConfigService);
    expect(() => guard.canActivate({} as never)).toThrow(
      ServiceUnavailableException,
    );
    expect(get).toHaveBeenCalledWith('STUDY_PROGRESS_ENABLED');
  });
});
