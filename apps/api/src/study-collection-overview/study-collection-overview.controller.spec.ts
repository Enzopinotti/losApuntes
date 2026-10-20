import { RequestMethod, ServiceUnavailableException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import type { ConfigService } from '@nestjs/config';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyCollectionSchema } from '../study-collections/mongo/study-collection.mongo-schema';
import { StudyCollectionsFeatureGuard } from '../study-collections/study-collections-feature.guard';
import { StudyCollectionOverviewController } from './study-collection-overview.controller';
import type { StudyCollectionOverviewService } from './study-collection-overview.service';
import './study-collection-overview.module';

describe('B152 private overview HTTP and release guard', () => {
  it('requires authentication and the existing feature flag', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudyCollectionOverviewController),
    ).toEqual([AuthSessionGuard, StudyCollectionsFeatureGuard]);
    const disabled = new StudyCollectionsFeatureGuard({
      get: jest.fn().mockReturnValue(false),
    } as unknown as ConfigService);
    expect(() => disabled.canActivate({} as never)).toThrow(
      ServiceUnavailableException,
    );
    const enabled = new StudyCollectionsFeatureGuard({
      get: jest.fn().mockReturnValue(true),
    } as unknown as ConfigService);
    expect(enabled.canActivate({} as never)).toBe(true);
  });

  it('declares a distinct authenticated GET with private no-store', () => {
    const method = Reflect.get(
      StudyCollectionOverviewController.prototype,
      'get',
    ) as object;
    expect(
      Reflect.getMetadata(PATH_METADATA, StudyCollectionOverviewController),
    ).toBe('study-collections/overview');
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('me');
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('uses only the session user and returns exactly the service response', async () => {
    const response = {
      collectionsCount: 0,
      collectionsWithResources: 0,
      fullCollectionsCount: 0,
      storedResourceReferences: 0,
      recentCollections: [],
    };
    const get = jest.fn().mockResolvedValue(response);
    const controller = new StudyCollectionOverviewController({
      get,
    } as unknown as StudyCollectionOverviewService);
    const request = { user: { id: 'owner-a' } } as AuthenticatedRequest;
    await expect(controller.get(request)).resolves.toEqual(response);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('owner-a');
  });

  it('keeps storage outages visible instead of returning empty statistics', async () => {
    const get = jest.fn().mockRejectedValue(new Error('storage-down'));
    const controller = new StudyCollectionOverviewController({
      get,
    } as unknown as StudyCollectionOverviewService);
    await expect(
      controller.get({ user: { id: 'owner-a' } } as AuthenticatedRequest),
    ).rejects.toThrow('storage-down');
  });

  it('declares an owner plus updated-at index for pre-facet sorting', () => {
    expect(StudyCollectionSchema.indexes()).toEqual(
      expect.arrayContaining([
        [{ ownerUserId: 1, updatedAt: -1, id: 1 }, { background: true }],
      ]),
    );
  });
});
