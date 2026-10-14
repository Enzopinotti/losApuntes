import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import type { ResourceService } from './domain/resource.service';
import { ResourcesController } from './resources.controller';

describe('owner resources HTTP route', () => {
  it('requires an authenticated verified account and disables caching', () => {
    const method = Reflect.get(ResourcesController.prototype, 'mine') as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('mine');
    expect(Reflect.getMetadata(GUARDS_METADATA, method)).toEqual([
      AuthSessionGuard,
      VerifiedEmailGuard,
    ]);
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('never accepts an author ID from query parameters', async () => {
    const listOwned = jest.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const controller = new ResourcesController({
      listOwned,
    } as unknown as ResourceService);
    const request = {
      user: { id: 'session-user' },
    } as AuthenticatedRequest;
    const query = {
      limit: 25,
      visibility: 'private' as const,
      cursor: 'opaque-page',
    };

    expect(await controller.mine(request, query)).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(listOwned).toHaveBeenCalledWith('session-user', {
      limit: 25,
      visibility: 'private',
      cursor: 'opaque-page',
    });
  });

  it('forwards search subject and sort while preserving the session owner', async () => {
    const listOwned = jest
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null });
    const controller = new ResourcesController({
      listOwned,
    } as unknown as ResourceService);
    await controller.mine(
      { user: { id: 'session-owner' } } as AuthenticatedRequest,
      {
        limit: 25,
        q: 'Álgebra',
        subjectId: '22222222-2222-4222-8222-222222222222',
        visibility: 'shared',
        order: 'oldest',
      },
    );
    expect(listOwned).toHaveBeenCalledWith('session-owner', {
      limit: 25,
      q: 'Álgebra',
      subjectId: '22222222-2222-4222-8222-222222222222',
      visibility: 'shared',
      order: 'oldest',
    });
  });

  it('protects owner subject facets with both guards and private caching', async () => {
    const method = Reflect.get(
      ResourcesController.prototype,
      'ownedSubjects',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('mine/subjects');
    expect(Reflect.getMetadata(GUARDS_METADATA, method)).toEqual([
      AuthSessionGuard,
      VerifiedEmailGuard,
    ]);
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });

    const listOwnedSubjects = jest.fn().mockResolvedValue({
      items: [],
      truncated: false,
    });
    const controller = new ResourcesController({
      listOwnedSubjects,
    } as unknown as ResourceService);
    await controller.ownedSubjects({
      user: { id: 'session-owner' },
    } as AuthenticatedRequest);
    expect(listOwnedSubjects).toHaveBeenCalledWith('session-owner');
  });
});
