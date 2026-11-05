import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { SocialRelationshipController } from './social-relationship.controller';
import type { SocialRelationshipService } from './social-relationship.service';

const profileId = '11111111-1111-4111-8111-111111111111';

describe('B150 authenticated relationship lookup HTTP', () => {
  it('enforces an authenticated no-store GET route with a UUID path parameter', () => {
    const method = Reflect.get(
      SocialRelationshipController.prototype,
      'get',
    ) as object;
    expect(
      Reflect.getMetadata(PATH_METADATA, SocialRelationshipController),
    ).toBe('social/profiles');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SocialRelationshipController),
    ).toEqual([AuthSessionGuard]);
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(
      ':profileId/relationship',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      SocialRelationshipController,
      'get',
    ) as Record<string, { data?: string; pipes?: unknown[] }>;
    expect(Object.values(args)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: 'profileId',
          pipes: [expect.anything()],
        }),
      ]),
    );
  });

  it('only uses the authenticated principal and requested public profile id', async () => {
    const get = jest.fn().mockResolvedValue({
      isSelf: false,
      isFollowing: true,
      followsYou: false,
      connection: null,
    });
    const controller = new SocialRelationshipController({
      get,
    } as unknown as SocialRelationshipService);
    const request = { user: { id: 'viewer-a' } } as AuthenticatedRequest;

    await expect(controller.get(request, profileId)).resolves.toEqual({
      isSelf: false,
      isFollowing: true,
      followsYou: false,
      connection: null,
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('viewer-a', profileId);
  });

  it('propagates permission and datastore failures', async () => {
    const get = jest.fn().mockRejectedValue(new Error('db-down'));
    const controller = new SocialRelationshipController({
      get,
    } as unknown as SocialRelationshipService);
    await expect(
      controller.get(
        { user: { id: 'viewer-a' } } as AuthenticatedRequest,
        profileId,
      ),
    ).rejects.toThrow('db-down');
  });
});
