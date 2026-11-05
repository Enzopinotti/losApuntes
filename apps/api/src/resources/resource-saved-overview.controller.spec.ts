import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { ResourceSavedOverviewController } from './resource-saved-overview.controller';
import type { ResourceSavedOverviewService } from './resource-saved-overview.service';

describe('B154 private saved library overview HTTP contract', () => {
  it('requires the session guard and a static no-store GET route', () => {
    const method = Reflect.get(
      ResourceSavedOverviewController.prototype,
      'get',
    ) as object;
    expect(
      Reflect.getMetadata(PATH_METADATA, ResourceSavedOverviewController),
    ).toBe('resources/saved/overview');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ResourceSavedOverviewController),
    ).toEqual([AuthSessionGuard]);
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('passes exclusively the user id from the authenticated session', async () => {
    const result = {
      savedResourcesCount: 0,
      subjectsCount: 0,
      recentSavedResources: [],
    };
    const get = jest.fn().mockResolvedValue(result);
    const controller = new ResourceSavedOverviewController({
      get,
    } as unknown as ResourceSavedOverviewService);

    await expect(
      controller.get({
        user: { id: 'authenticated-owner' },
      } as AuthenticatedRequest),
    ).resolves.toEqual(result);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('authenticated-owner');
  });

  it('does not disguise storage failures as a successful empty overview', async () => {
    const get = jest.fn().mockRejectedValue(new Error('db-offline'));
    const controller = new ResourceSavedOverviewController({
      get,
    } as unknown as ResourceSavedOverviewService);
    await expect(
      controller.get({
        user: { id: 'authenticated-owner' },
      } as AuthenticatedRequest),
    ).rejects.toThrow('db-offline');
  });
});
