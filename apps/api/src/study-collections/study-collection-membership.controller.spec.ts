import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { CollectionMembershipPageDto } from './dto/collection-membership.dto';
import type { StudyCollectionMembershipService } from './domain/study-collection-membership.service';
import { StudyCollection } from './mongo/study-collection.mongo-schema';
import { StudyCollectionSchema } from './mongo/study-collection.mongo-schema';
import { StudyCollectionMembershipController } from './study-collection-membership.controller';
import { StudyCollectionsFeatureGuard } from './study-collections-feature.guard';
import './study-collections.module';

const resourceId = '11111111-1111-4111-8111-111111111111';

describe('B151 resource membership HTTP', () => {
  it('protects GET with Auth, feature flag, no-store and UUID pipe', () => {
    const method = Reflect.get(
      StudyCollectionMembershipController.prototype,
      'list',
    ) as object;
    expect(
      Reflect.getMetadata(PATH_METADATA, StudyCollectionMembershipController),
    ).toBe('study-collections/resources');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudyCollectionMembershipController),
    ).toEqual([AuthSessionGuard, StudyCollectionsFeatureGuard]);
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(
      ':resourceId/membership',
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
      StudyCollectionMembershipController,
      'list',
    ) as Record<string, { data?: string; pipes?: unknown[] }>;
    expect(Object.values(args)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: 'resourceId',
          pipes: [expect.anything()],
        }),
      ]),
    );
  });

  it('passes authenticated owner and resource ID but never lets client supply an owner', async () => {
    const list = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new StudyCollectionMembershipController({
      list,
    } as unknown as StudyCollectionMembershipService);
    const request = { user: { id: 'owner-a' } } as AuthenticatedRequest;
    const dto = new CollectionMembershipPageDto();

    await expect(controller.list(request, resourceId, dto)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(list).toHaveBeenCalledWith('owner-a', resourceId, dto);
  });

  it('bounds page size and cursor length at the HTTP boundary', () => {
    const initial = new CollectionMembershipPageDto();
    expect(initial.limit).toBe(25);
    expect(validateSync(initial)).toHaveLength(0);
    const valid = plainToInstance(CollectionMembershipPageDto, { limit: '5' });
    expect(valid.limit).toBe(5);
    expect(validateSync(valid)).toHaveLength(0);
    const invalid = plainToInstance(CollectionMembershipPageDto, {
      limit: '26',
      cursor: 'x'.repeat(513),
    });
    expect(validateSync(invalid)).not.toHaveLength(0);
  });

  it('registers owner and resource multikey lookup index', () => {
    expect(StudyCollection.name).toBe('StudyCollection');
    expect(StudyCollectionSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { ownerUserId: 1, resourceIds: 1, updatedAt: -1, id: 1 },
          { background: true },
        ],
      ]),
    );
  });

  it('propagates service outages instead of showing an empty selection', async () => {
    const list = jest.fn().mockRejectedValue(new Error('db-offline'));
    const controller = new StudyCollectionMembershipController({
      list,
    } as unknown as StudyCollectionMembershipService);
    await expect(
      controller.list(
        { user: { id: 'owner-a' } } as AuthenticatedRequest,
        resourceId,
        new CollectionMembershipPageDto(),
      ),
    ).rejects.toThrow('db-offline');
  });
});
