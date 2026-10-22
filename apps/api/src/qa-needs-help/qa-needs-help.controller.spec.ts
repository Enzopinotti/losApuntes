import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { QaNeedsHelpController } from './qa-needs-help.controller';
import type { QaNeedsHelpService } from './qa-needs-help.service';

describe('B166 needs-help controller', () => {
  it('requires an authenticated session and disables shared caching', () => {
    expect(Reflect.getMetadata(PATH_METADATA, QaNeedsHelpController)).toBe(
      'qa/discovery',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, QaNeedsHelpController)).toEqual(
      [AuthSessionGuard],
    );
    const handler = Reflect.get(
      QaNeedsHelpController.prototype,
      'list',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('needs-help');
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      QaNeedsHelpController,
      'list',
    ) as Record<string, { data?: string; pipes?: unknown[] }>;
    expect(
      Object.values(args).some(
        (value) => value.data === 'subjectId' && (value.pipes?.length ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it('uses the validated session owner, not user IDs from the caller', async () => {
    const result = { items: [], nextCursor: null };
    const forSubject = jest.fn().mockResolvedValue(result);
    const controller = new QaNeedsHelpController({
      forSubject,
    } as unknown as QaNeedsHelpService);
    await expect(
      controller.list(
        {
          user: { id: 'logged-in-user' },
          query: { userId: 'another-user' },
        } as unknown as AuthenticatedRequest,
        'subject-uuid',
        'opaque-cursor',
      ),
    ).resolves.toEqual(result);
    expect(forSubject).toHaveBeenCalledWith(
      'logged-in-user',
      'subject-uuid',
      'opaque-cursor',
    );
  });
});
