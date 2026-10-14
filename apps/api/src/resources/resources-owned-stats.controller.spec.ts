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

describe('authenticated owner resource statistics route', () => {
  it('requires authenticated verified owner and private no-store response', () => {
    const method = Reflect.get(
      ResourcesController.prototype,
      'ownedStatistics',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('mine/stats');
    expect(Reflect.getMetadata(GUARDS_METADATA, method)).toEqual([
      AuthSessionGuard,
      VerifiedEmailGuard,
    ]);
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('never lets a client select the author whose statistics are read', async () => {
    const statistics = {
      generatedAt: '2026-10-12T00:00:00.000Z',
      publications: { total: 0, private: 0, shared: 0, public: 0 },
      currentSaves: 0,
      activeShareGrants: 0,
      topResources: [],
    };
    const getOwnedStatistics = jest.fn().mockResolvedValue(statistics);
    const controller = new ResourcesController({
      getOwnedStatistics,
    } as unknown as ResourceService);
    const request = {
      user: { id: 'authenticated-owner' },
    } as AuthenticatedRequest;
    await expect(controller.ownedStatistics(request)).resolves.toEqual(
      statistics,
    );
    expect(getOwnedStatistics).toHaveBeenCalledTimes(1);
    expect(getOwnedStatistics).toHaveBeenCalledWith('authenticated-owner');
  });
});
