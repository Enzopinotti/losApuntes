import { RequestMethod, ServiceUnavailableException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import type { ConfigService } from '@nestjs/config';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyProgressFeatureGuard } from './study-progress.feature.guard';
import { StudySessionSummaryController } from './study-session-summary.controller';
import type { StudySessionSummaryService } from './study-session-summary.service';

const subject = '11111111-1111-4111-8111-111111111111';

describe('B157 authenticated Study Session summary HTTP', () => {
  it('protects a distinct GET path with session, feature flag, UUID and no-store', () => {
    const handler = Reflect.get(
      StudySessionSummaryController.prototype,
      'get',
    ) as object;
    expect(
      Reflect.getMetadata(PATH_METADATA, StudySessionSummaryController),
    ).toBe('study-progress');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudySessionSummaryController),
    ).toEqual([AuthSessionGuard, StudyProgressFeatureGuard]);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':subjectId/summary',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StudySessionSummaryController,
      'get',
    ) as Record<string, { data?: string; pipes?: unknown[] }>;
    expect(Object.values(args)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: 'subjectId',
          pipes: [expect.anything()],
        }),
      ]),
    );
  });

  it('retains the feature flag fail-closed policy', () => {
    const guard = new StudyProgressFeatureGuard({
      get: jest.fn().mockReturnValue(false),
    } as unknown as ConfigService);
    expect(() => guard.canActivate({} as never)).toThrow(
      ServiceUnavailableException,
    );
    const enabled = new StudyProgressFeatureGuard({
      get: jest.fn().mockReturnValue(true),
    } as unknown as ConfigService);
    expect(enabled.canActivate({} as never)).toBe(true);
  });

  it('passes only authenticated user and subject to the summary service', async () => {
    const result = {
      subjectId: subject,
      revision: 1,
      updatedAt: '2026-10-20T12:03:00.000Z',
      tasks: { total: 0, completed: 0, pending: 0 },
      minutes: { planned: 0, completed: 0, remaining: 0 },
      completionPercent: 0,
      nextTask: null,
    };
    const get = jest.fn().mockResolvedValue(result);
    const controller = new StudySessionSummaryController({
      get,
    } as unknown as StudySessionSummaryService);
    await expect(
      controller.get(
        { user: { id: 'owner-from-session' } } as AuthenticatedRequest,
        subject,
      ),
    ).resolves.toEqual(result);
    expect(get).toHaveBeenCalledWith('owner-from-session', subject);
  });

  it('propagates backend errors instead of returning an empty summary', async () => {
    const get = jest.fn().mockRejectedValue(new Error('mongo-offline'));
    const controller = new StudySessionSummaryController({
      get,
    } as unknown as StudySessionSummaryService);
    await expect(
      controller.get(
        { user: { id: 'owner-from-session' } } as AuthenticatedRequest,
        subject,
      ),
    ).rejects.toThrow('mongo-offline');
  });
});
