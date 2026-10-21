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
import { StudyAgendaController } from './study-agenda.controller';
import type { StudyAgendaService } from './study-agenda.service';

describe('B170 study agenda HTTP route and feature flag', () => {
  it('requires revocable auth and the existing study-progress feature flag', () => {
    expect(Reflect.getMetadata(PATH_METADATA, StudyAgendaController)).toBe(
      'study-progress/me',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, StudyAgendaController)).toEqual(
      [AuthSessionGuard, StudyProgressFeatureGuard],
    );
    const handler = Reflect.get(
      StudyAgendaController.prototype,
      'getAgenda',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('agenda');
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('reads the session user only and ignores supplied account selectors', async () => {
    const response = { scheduled: [], unscheduled: [] };
    const forOwner = jest.fn().mockResolvedValue(response);
    const controller = new StudyAgendaController({
      forOwner,
    } as unknown as StudyAgendaService);

    await expect(
      controller.getAgenda({
        user: { id: 'session-owner' },
        query: { userId: 'foreign' },
        body: { ownerUserId: 'foreign' },
      } as unknown as AuthenticatedRequest),
    ).resolves.toEqual(response);
    expect(forOwner).toHaveBeenCalledTimes(1);
    expect(forOwner).toHaveBeenCalledWith('session-owner');
  });

  it('rejects access while saved study progress is disabled', () => {
    const get = jest.fn().mockReturnValue(false);
    const config = { get } as unknown as ConfigService;
    const guard = new StudyProgressFeatureGuard(config);
    expect(() => guard.canActivate({} as never)).toThrow(
      ServiceUnavailableException,
    );
    expect(get).toHaveBeenCalledWith('STUDY_PROGRESS_ENABLED');
  });

  it('allows the route to proceed when saved study progress is enabled', () => {
    const config = {
      get: jest.fn().mockReturnValue(true),
    } as unknown as ConfigService;
    expect(new StudyProgressFeatureGuard(config).canActivate({} as never)).toBe(
      true,
    );
  });
});
