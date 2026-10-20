import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { NetworkOverviewController } from './network-overview.controller';
import type { NetworkOverviewService } from './network-overview.service';

describe('B158 social network overview HTTP contract', () => {
  it('uses a unique owner-only GET route behind AuthSessionGuard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, NetworkOverviewController)).toBe(
      'social/me',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, NetworkOverviewController),
    ).toEqual([AuthSessionGuard]);
    const method = Reflect.get(
      NetworkOverviewController.prototype,
      'getOverview',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('network-overview');
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('passes only the authenticated account ID and never trusts query identity', async () => {
    const expected = {
      followingCount: 2,
      followersCount: 1,
      acceptedConnectionsCount: 3,
      pendingIncomingCount: 0,
      pendingOutgoingCount: 4,
    };
    const forOwner = jest.fn().mockResolvedValue(expected);
    const controller = new NetworkOverviewController({
      forOwner,
    } as unknown as NetworkOverviewService);

    await expect(
      controller.getOverview({
        user: { id: 'account-from-session' },
        query: { userId: 'some-other-account' },
      } as unknown as AuthenticatedRequest),
    ).resolves.toEqual(expected);
    expect(forOwner).toHaveBeenCalledTimes(1);
    expect(forOwner).toHaveBeenCalledWith('account-from-session');
  });

  it('does not convert database failures into a false success', async () => {
    const forOwner = jest.fn().mockRejectedValue(new Error('database offline'));
    const controller = new NetworkOverviewController({
      forOwner,
    } as unknown as NetworkOverviewService);
    await expect(
      controller.getOverview({
        user: { id: 'owner' },
      } as AuthenticatedRequest),
    ).rejects.toThrow('database offline');
  });
});
