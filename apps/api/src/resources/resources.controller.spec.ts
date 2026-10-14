import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import type { ResourceService } from './domain/resource.service';
import { ResourcesController } from './resources.controller';

describe('owner-only resource share grants route', () => {
  it('uses session and verified-email guards, and disables caching', () => {
    const method = Reflect.get(
      ResourcesController.prototype,
      'shares',
    ) as object;
    const guards = Reflect.getMetadata(GUARDS_METADATA, method) as unknown[];
    const headers = Reflect.getMetadata(HEADERS_METADATA, method) as Array<{
      name: string;
      value: string;
    }>;

    expect(guards).toContain(AuthSessionGuard);
    expect(guards).toContain(VerifiedEmailGuard);
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(':id/shares');
    expect(headers).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('always scopes results to the authenticated user, not a query user ID', async () => {
    const listing = { items: [], nextCursor: null, resourceRevision: 5 };
    const listShareGrants = jest.fn().mockResolvedValue(listing);
    const controller = new ResourcesController({
      listShareGrants,
    } as unknown as ResourceService);
    const request = {
      user: { id: 'authenticated-owner' },
    } as AuthenticatedRequest;

    await expect(
      controller.shares(request, '11111111-1111-4111-8111-111111111111', {
        limit: 20,
        cursor: 'opaque-cursor',
      }),
    ).resolves.toEqual(listing);
    expect(listShareGrants).toHaveBeenCalledWith(
      'authenticated-owner',
      '11111111-1111-4111-8111-111111111111',
      20,
      'opaque-cursor',
    );
  });
});
