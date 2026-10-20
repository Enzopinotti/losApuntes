import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { StudyProgressController } from './study-progress.controller';
import { StudyProgressFeatureGuard } from './study-progress.feature.guard';
import type { StudyProgressService } from './study-progress.service';

describe('B143 private study-progress index route', () => {
  it('keeps the same required auth, feature flag and no-store boundary', () => {
    const method = Reflect.get(
      StudyProgressController.prototype,
      'list',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('/');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudyProgressController),
    ).toEqual([AuthSessionGuard, StudyProgressFeatureGuard]);
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('derives the listing owner from the server-authenticated principal', async () => {
    const list = jest.fn().mockResolvedValue({ items: [] });
    const controller = new StudyProgressController({
      list,
    } as unknown as StudyProgressService);
    const request = {
      user: { id: 'principal-a' },
    } as AuthenticatedRequest;

    await expect(controller.list(request)).resolves.toEqual({ items: [] });
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith('principal-a');
  });
});
