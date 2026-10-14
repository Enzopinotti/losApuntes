import { GUARDS_METADATA, HEADERS_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import type { ResourceSavedSearchService } from './domain/resource-saved-search.service';
import { ResourceSavedSearchController } from './resource-saved-search.controller';

describe('saved search HTTP authority', () => {
  it('uses session guard, static route and private/no-store response', () => {
    const method = ResourceSavedSearchController.prototype.search;
    expect(Reflect.getMetadata(GUARDS_METADATA, method)).toContain(AuthSessionGuard);
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('search');
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('never accepts an owner ID supplied by a query parameter', async () => {
    const search = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new ResourceSavedSearchController({
      search,
    } as unknown as ResourceSavedSearchService);
    const request = { user: { id: 'authenticated-owner' } } as AuthenticatedRequest;
    const query = {
      q: 'algebra',
      subjectId: '11111111-1111-4111-8111-111111111111',
      limit: 25,
      cursor: 'opaque',
    };
    await controller.search(request, query);
    expect(search).toHaveBeenCalledWith('authenticated-owner', 'algebra', 25, 'opaque', query.subjectId);
  });
  it('keeps saved-subject facets behind session and private cache policy', async () => {
    const method = ResourceSavedSearchController.prototype.subjects;
    expect(Reflect.getMetadata(GUARDS_METADATA, method)).toContain(AuthSessionGuard);
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('subjects');
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control', value: 'private, no-store',
    });
    const listSubjects = jest.fn().mockResolvedValue({ items: [], truncated: false });
    const controller = new ResourceSavedSearchController({ listSubjects } as unknown as ResourceSavedSearchService);
    await controller.subjects({ user: { id: 'owner' } } as AuthenticatedRequest);
    expect(listSubjects).toHaveBeenCalledWith('owner');
  });
});
