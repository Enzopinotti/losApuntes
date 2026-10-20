import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { QaSubjectActivityController } from './qa-subject-activity.controller';
import type { QaSubjectActivityService } from './qa-subject-activity.service';

describe('B160 private Q&A subject activity controller', () => {
  it('requires a session and prevents caching personalized counts', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, QaSubjectActivityController),
    ).toBe('qa/me');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, QaSubjectActivityController),
    ).toEqual([AuthSessionGuard]);

    const handler = Reflect.get(
      QaSubjectActivityController.prototype,
      'getSubjectActivity',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'subject-activity',
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('uses only the validated session owner, not client-supplied identifiers', async () => {
    const expected = { items: [], hasMore: false };
    const forOwner = jest.fn().mockResolvedValue(expected);
    const controller = new QaSubjectActivityController({
      forOwner,
    } as unknown as QaSubjectActivityService);

    await expect(
      controller.getSubjectActivity({
        user: { id: 'session-owner' },
        query: { userId: 'other-student' },
      } as unknown as AuthenticatedRequest),
    ).resolves.toEqual(expected);
    expect(forOwner).toHaveBeenCalledTimes(1);
    expect(forOwner).toHaveBeenCalledWith('session-owner');
  });
});
