import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { SavedStatusBatchDto } from './dto/saved-status-batch.dto';
import { ResourceSavedStatusController } from './resource-saved-status.controller';
import type { ResourceSavedStatusService } from './resource-saved-status.service';
import { ResourcesModule } from './resources.module';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';

describe('B155 private bookmark-status batch HTTP', () => {
  it('declares authenticated static POST, no-store and module registration', () => {
    const method = Reflect.get(
      ResourceSavedStatusController.prototype,
      'check',
    ) as object;
    expect(
      Reflect.getMetadata(PATH_METADATA, ResourceSavedStatusController),
    ).toBe('resources/saved');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ResourceSavedStatusController),
    ).toEqual([AuthSessionGuard]);
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('status');
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
    const registered = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      ResourcesModule,
    ) as unknown[];
    expect(registered).toContain(ResourceSavedStatusController);
  });

  it('never trusts an owner ID from the body; always uses the session', async () => {
    const expected = {
      items: [
        { resourceId: first, isSaved: true },
        { resourceId: second, isSaved: false },
      ],
    };
    const check = jest.fn().mockResolvedValue(expected);
    const controller = new ResourceSavedStatusController({
      check,
    } as unknown as ResourceSavedStatusService);
    const body = plainToInstance(SavedStatusBatchDto, {
      resourceIds: [first, second],
      ownerUserId: 'spoofed-account',
    });
    const request = {
      user: { id: 'authenticated-owner' },
    } as AuthenticatedRequest;

    await expect(controller.check(request, body)).resolves.toEqual(expected);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith('authenticated-owner', [first, second]);
  });

  it('validates between one and fifty distinct UUIDv4 resource IDs', () => {
    const valid = plainToInstance(SavedStatusBatchDto, {
      resourceIds: [first, second],
    });
    expect(validateSync(valid)).toHaveLength(0);

    for (const body of [
      {},
      { resourceIds: [] },
      { resourceIds: [first, first] },
      { resourceIds: ['not-uuid'] },
      { resourceIds: ['11111111-1111-1111-8111-111111111111'] },
      { resourceIds: 'invalid' },
      { resourceIds: Array(51).fill(first) },
    ]) {
      const invalid = plainToInstance(SavedStatusBatchDto, body);
      expect(validateSync(invalid)).not.toHaveLength(0);
    }
  });

  it('propagates storage and authorization errors without fabricating flags', async () => {
    const check = jest.fn().mockRejectedValue(new Error('db-offline'));
    const controller = new ResourceSavedStatusController({
      check,
    } as unknown as ResourceSavedStatusService);
    await expect(
      controller.check(
        { user: { id: 'owner-a' } } as AuthenticatedRequest,
        { resourceIds: [first] },
      ),
    ).rejects.toThrow('db-offline');
  });
});
