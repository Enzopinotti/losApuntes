import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { QaFollowUpsController } from './qa-follow-ups.controller';
import type { QaFollowUpsService } from './qa-follow-ups.service';

describe('B161 private follow-ups HTTP route', () => {
  it('requires a session and a non-cacheable response', () => {
    expect(Reflect.getMetadata(PATH_METADATA, QaFollowUpsController)).toBe(
      'qa/me',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, QaFollowUpsController)).toEqual(
      [AuthSessionGuard],
    );

    const handler = Reflect.get(
      QaFollowUpsController.prototype,
      'getFollowUps',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('follow-ups');
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('does not trust query, body or caller-picked owner identifiers', async () => {
    const inbox = {
      needsReview: { items: [], hasMore: false },
      awaitingReplies: { items: [], hasMore: false },
    };
    const forOwner = jest.fn().mockResolvedValue(inbox);
    const controller = new QaFollowUpsController({
      forOwner,
    } as unknown as QaFollowUpsService);

    await expect(
      controller.getFollowUps({
        user: { id: 'signed-in-user' },
        query: { userId: 'other-user' },
        body: { ownerUserId: 'other-user' },
      } as unknown as AuthenticatedRequest),
    ).resolves.toEqual(inbox);
    expect(forOwner).toHaveBeenCalledTimes(1);
    expect(forOwner).toHaveBeenCalledWith('signed-in-user');
  });
});
