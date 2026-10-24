import { RequestMethod, ServiceUnavailableException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import type { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import type { StudyCollectionOrderService } from './domain/study-collection-order.service';
import { ReorderStudyCollectionResourcesDto } from './dto/reorder-study-collection-resources.dto';
import { StudyCollectionOrderController } from './study-collection-order.controller';
import { StudyCollectionsFeatureGuard } from './study-collections-feature.guard';

const collectionId = '11111111-1111-4111-8111-111111111111';
const a = '22222222-2222-4222-8222-222222222222';
const b = '33333333-3333-4333-8333-333333333333';

describe('B153 PATCH study collection resource order', () => {
  it('requires Auth, existing collections feature flag, private no-store and a UUIDv4 path', () => {
    const fn = Reflect.get(
      StudyCollectionOrderController.prototype,
      'reorder',
    ) as object;
    expect(
      Reflect.getMetadata(PATH_METADATA, StudyCollectionOrderController),
    ).toBe('study-collections');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudyCollectionOrderController),
    ).toEqual([AuthSessionGuard, StudyCollectionsFeatureGuard]);
    expect(Reflect.getMetadata(PATH_METADATA, fn)).toBe(':id/resources/order');
    expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(HEADERS_METADATA, fn)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StudyCollectionOrderController,
      'reorder',
    ) as Record<string, { data?: string; pipes?: unknown[] }>;
    expect(Object.values(args)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ data: 'id', pipes: [expect.anything()] }),
      ]),
    );
  });

  it('passes only the authenticated owner and the complete order to the service', async () => {
    const expected = {
      changed: true,
      collection: {
        id: collectionId,
        resourceIds: [b, a],
        resourceCount: 2,
        revision: 5,
        updatedAt: '2026-10-20T12:00:00.000Z',
      },
    };
    const reorder = jest.fn().mockResolvedValue(expected);
    const controller = new StudyCollectionOrderController({
      reorder,
    } as unknown as StudyCollectionOrderService);
    const request = { user: { id: 'owner-a' } } as AuthenticatedRequest;
    const dto = plainToInstance(ReorderStudyCollectionResourcesDto, {
      expectedRevision: 4,
      resourceIds: [b, a],
    });
    await expect(
      controller.reorder(request, collectionId, dto),
    ).resolves.toEqual(expected);
    expect(reorder).toHaveBeenCalledWith('owner-a', collectionId, dto);
  });

  it('rejects invalid revisions, duplicate/malformed UUIDs and oversized arrays', () => {
    const valid = plainToInstance(ReorderStudyCollectionResourcesDto, {
      expectedRevision: 1,
      resourceIds: [],
    });
    expect(validateSync(valid)).toHaveLength(0);
    for (const input of [
      { expectedRevision: 0, resourceIds: [a, b] },
      { expectedRevision: -1, resourceIds: [a, b] },
      { expectedRevision: 1.5, resourceIds: [a, b] },
      { expectedRevision: 2, resourceIds: [a, a] },
      { expectedRevision: 2, resourceIds: ['bad-uuid'] },
      { expectedRevision: 2, resourceIds: 'wrong-shape' },
      { expectedRevision: 2, resourceIds: Array(101).fill(a) },
    ]) {
      const dto = plainToInstance(ReorderStudyCollectionResourcesDto, input);
      expect(validateSync(dto)).not.toHaveLength(0);
    }
  });

  it('preserves fail-closed feature flags without altering runtime config', () => {
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

  it('does not turn service outages into a successful reorder', async () => {
    const reorder = jest.fn().mockRejectedValue(new Error('mongo-down'));
    const controller = new StudyCollectionOrderController({
      reorder,
    } as unknown as StudyCollectionOrderService);
    await expect(
      controller.reorder(
        { user: { id: 'owner-a' } } as AuthenticatedRequest,
        collectionId,
        { expectedRevision: 4, resourceIds: [b, a] },
      ),
    ).rejects.toThrow('mongo-down');
  });
});
