import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { ReceivedRepliesController } from './received-replies.controller';
import type { ReceivedRepliesService } from './received-replies.service';

describe('B164 authenticated received replies endpoint', () => {
  it('is owner-authenticated and never cacheable by proxies', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ReceivedRepliesController)).toBe(
      'qa/me',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, ReceivedRepliesController)).toEqual(
      [AuthSessionGuard],
    );
    const method = Reflect.get(
      ReceivedRepliesController.prototype,
      'list',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('received-replies');
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('does not accept owner identity from request query/body', async () => {
    const expected = { items: [], nextCursor: null };
    const forOwner = jest.fn().mockResolvedValue(expected);
    const controller = new ReceivedRepliesController({
      forOwner,
    } as unknown as ReceivedRepliesService);
    const request = {
      user: { id: 'session-owner' },
      query: { userId: 'attacker-owner' },
      body: { ownerId: 'attacker-owner' },
    } as unknown as AuthenticatedRequest;

    await expect(controller.list(request, 'opaque-cursor')).resolves.toEqual(
      expected,
    );
    expect(forOwner).toHaveBeenCalledTimes(1);
    expect(forOwner).toHaveBeenCalledWith('session-owner', 'opaque-cursor');
  });
});
