import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { QaDiscussionsController } from './qa-discussions.controller';
import type { QaDiscussionsService } from './qa-discussions.service';

describe('B162 private discussions route', () => {
  it('requires AuthSessionGuard and sets private no-store on responses', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, QaDiscussionsController),
    ).toBe('qa/me');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, QaDiscussionsController),
    ).toEqual([AuthSessionGuard]);

    const handler = Reflect.get(
      QaDiscussionsController.prototype,
      'preview',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('discussions');
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('derives the owner strictly from the validated session', async () => {
    const preview = { items: [], hasMore: false };
    const previewForOwner = jest.fn().mockResolvedValue(preview);
    const controller = new QaDiscussionsController({
      previewForOwner,
    } as unknown as QaDiscussionsService);

    await expect(
      controller.preview({
        user: { id: 'authenticated-user' },
        query: { ownerId: 'different-user' },
        body: { userId: 'different-user' },
      } as unknown as AuthenticatedRequest),
    ).resolves.toEqual(preview);

    expect(previewForOwner).toHaveBeenCalledTimes(1);
    expect(previewForOwner).toHaveBeenCalledWith('authenticated-user');
  });
});
