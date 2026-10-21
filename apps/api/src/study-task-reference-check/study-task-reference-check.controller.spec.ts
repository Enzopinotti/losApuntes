import { ServiceUnavailableException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import type { ConfigService } from '@nestjs/config';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyProgressFeatureGuard } from '../study-progress/study-progress.feature.guard';
import { StudyTaskReferenceCheckController } from './study-task-reference-check.controller';
import type { StudyTaskReferenceCheckService } from './study-task-reference-check.service';

describe('B172 study task reference-check HTTP route', () => {
  it('requires owner session, feature flag, UUID param and no-store response', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, StudyTaskReferenceCheckController),
    ).toBe('study-progress');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudyTaskReferenceCheckController),
    ).toEqual([AuthSessionGuard, StudyProgressFeatureGuard]);

    const method = Reflect.get(
      StudyTaskReferenceCheckController.prototype,
      'getStatus',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(
      ':subjectId/reference-check',
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
    const params = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StudyTaskReferenceCheckController,
      'getStatus',
    ) as Record<string, { data?: string; pipes?: unknown[] }>;
    expect(
      Object.values(params).some(
        (entry) =>
          entry.data === 'subjectId' && (entry.pipes?.length ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it('never delegates to an owner supplied in the request body or query', async () => {
    const expected = {
      subjectId: 'subject-id',
      revision: 1,
      checked: 0,
      available: 0,
      unavailable: 0,
      items: [],
    };
    const forOwner = jest.fn().mockResolvedValue(expected);
    const controller = new StudyTaskReferenceCheckController({
      forOwner,
    } as unknown as StudyTaskReferenceCheckService);
    const result = await controller.getStatus(
      {
        user: { id: 'authenticated-owner' },
        query: { ownerUserId: 'foreign' },
        body: { userId: 'foreign' },
      } as unknown as AuthenticatedRequest,
      'subject-id',
    );
    expect(result).toEqual(expected);
    expect(forOwner).toHaveBeenCalledWith('authenticated-owner', 'subject-id');
    expect(forOwner).toHaveBeenCalledTimes(1);
  });

  it('uses existing feature flag with no new environment variables', () => {
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
