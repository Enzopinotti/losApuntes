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
import { StudyNextActionsController } from './study-next-actions.controller';
import type { StudyNextActionsService } from './study-next-actions.service';

describe('B171 private next study actions HTTP route', () => {
  it('requires revocable auth, enabled progress and no shared caching', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, StudyNextActionsController),
    ).toBe('study-progress/me');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudyNextActionsController),
    ).toEqual([AuthSessionGuard, StudyProgressFeatureGuard]);
    const method = Reflect.get(
      StudyNextActionsController.prototype,
      'getNextActions',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('next-actions');
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('gets the owner exclusively from the authenticated session', async () => {
    const expected = {
      items: [],
      summary: {
        totalPlans: 0,
        actionablePlans: 0,
        completedPlans: 0,
        emptyPlans: 0,
      },
    };
    const forOwner = jest.fn().mockResolvedValue(expected);
    const controller = new StudyNextActionsController({
      forOwner,
    } as unknown as StudyNextActionsService);

    const result = await controller.getNextActions({
      user: { id: 'authenticated-student' },
      query: { userId: 'attacker' },
      body: { ownerUserId: 'attacker' },
    } as unknown as AuthenticatedRequest);
    expect(result).toEqual(expected);
    expect(forOwner).toHaveBeenCalledTimes(1);
    expect(forOwner).toHaveBeenCalledWith('authenticated-student');
  });

  it('honors existing feature flag and fails closed when it is disabled', () => {
    const get = jest.fn().mockReturnValue(false);
    const config = { get } as unknown as ConfigService;
    const guard = new StudyProgressFeatureGuard(config);
    expect(() => guard.canActivate({} as never)).toThrow(
      ServiceUnavailableException,
    );
    expect(get).toHaveBeenCalledWith('STUDY_PROGRESS_ENABLED');
  });

  it('supports enabled study progress with no new configuration flags', () => {
    const config = {
      get: jest.fn().mockReturnValue(true),
    } as unknown as ConfigService;
    expect(new StudyProgressFeatureGuard(config).canActivate({} as never)).toBe(
      true,
    );
  });
});
