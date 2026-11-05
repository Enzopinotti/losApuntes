import type { Model } from 'mongoose';

import {
  SocialConnection,
  SocialFollow,
} from '../social/mongo/social.mongo-schemas';
import { NetworkOverviewService } from './network-overview.service';

interface CountQuery {
  maxTimeMS: jest.Mock<CountQuery, [number]>;
  exec: jest.Mock<Promise<number>, []>;
}

function countQuery(value: number): CountQuery {
  const query: CountQuery = {
    maxTimeMS: jest.fn<CountQuery, [number]>(),
    exec: jest.fn<Promise<number>, []>().mockResolvedValue(value),
  };
  query.maxTimeMS.mockReturnValue(query);
  return query;
}

function fixture(following: number[], connections: number[]) {
  const followCount = jest.fn<unknown, [Record<string, unknown>]>();
  const connectionCount = jest.fn<unknown, [Record<string, unknown>]>();
  const followQueries = following.map(countQuery);
  const connectionQueries = connections.map(countQuery);

  for (const query of followQueries) {
    followCount.mockReturnValueOnce(query);
  }
  for (const query of connectionQueries) {
    connectionCount.mockReturnValueOnce(query);
  }

  const service = new NetworkOverviewService(
    { countDocuments: followCount } as unknown as Model<SocialFollow>,
    { countDocuments: connectionCount } as unknown as Model<SocialConnection>,
  );
  return {
    service,
    followCount,
    connectionCount,
    followQueries,
    connectionQueries,
  };
}
describe('B158 private social network overview', () => {
  it('returns separate following, followers, accepted and directional pending totals', async () => {
    const {
      service,
      followCount,
      connectionCount,
      followQueries,
      connectionQueries,
    } = fixture([4, 9], [3, 2, 1]);

    await expect(service.forOwner('owner-a')).resolves.toEqual({
      followingCount: 4,
      followersCount: 9,
      acceptedConnectionsCount: 3,
      pendingIncomingCount: 2,
      pendingOutgoingCount: 1,
    });

    expect(followCount).toHaveBeenCalledTimes(2);
    expect(connectionCount).toHaveBeenCalledTimes(3);
    expect(
      followQueries.map((query) => query.maxTimeMS.mock.calls[0]?.[0]),
    ).toEqual([5000, 5000]);
    expect(
      connectionQueries.map((query) => query.maxTimeMS.mock.calls[0]?.[0]),
    ).toEqual([5000, 5000, 5000]);
    expect(followCount.mock.calls[0]?.[0]).toEqual({
      followerUserId: 'owner-a',
      followeeUserId: { $ne: 'owner-a' },
    });
    expect(followCount.mock.calls[1]?.[0]).toEqual({
      followeeUserId: 'owner-a',
      followerUserId: { $ne: 'owner-a' },
    });
  });

  it('never counts connections involving unrelated accounts or malformed self-pairs', async () => {
    const { service, connectionCount } = fixture([0, 0], [0, 0, 0]);
    await service.forOwner('owner-a');

    const participants = [
      { userLowId: 'owner-a', userHighId: { $ne: 'owner-a' } },
      { userHighId: 'owner-a', userLowId: { $ne: 'owner-a' } },
    ];
    expect(connectionCount.mock.calls[0]?.[0]).toEqual({
      status: 'accepted',
      $or: participants,
    });
    expect(connectionCount.mock.calls[1]?.[0]).toEqual({
      status: 'pending',
      $or: [
        {
          userLowId: 'owner-a',
          userHighId: { $ne: 'owner-a' },
          $expr: { $eq: ['$requestedByUserId', '$userHighId'] },
        },
        {
          userHighId: 'owner-a',
          userLowId: { $ne: 'owner-a' },
          $expr: { $eq: ['$requestedByUserId', '$userLowId'] },
        },
      ],
    });
    expect(connectionCount.mock.calls[2]?.[0]).toEqual({
      status: 'pending',
      requestedByUserId: 'owner-a',
      $or: participants,
    });
  });

  it('returns explicit zero totals for a brand-new network without fetching rows', async () => {
    const { service, followCount, connectionCount } = fixture(
      [0, 0],
      [0, 0, 0],
    );
    await expect(service.forOwner('owner-new')).resolves.toEqual({
      followingCount: 0,
      followersCount: 0,
      acceptedConnectionsCount: 0,
      pendingIncomingCount: 0,
      pendingOutgoingCount: 0,
    });

    expect(followCount).toHaveBeenCalledTimes(2);
    expect(connectionCount).toHaveBeenCalledTimes(3);
  });

  it('propagates database failures instead of returning fake or partial totals', async () => {
    const followCount = jest.fn<unknown, [Record<string, unknown>]>();
    const failingQuery = countQuery(0);
    failingQuery.exec.mockRejectedValue(new Error('database unavailable'));
    followCount.mockReturnValue(failingQuery);
    const connectionCount = jest.fn<unknown, [Record<string, unknown>]>();
    connectionCount.mockReturnValue(countQuery(0));
    const service = new NetworkOverviewService(
      { countDocuments: followCount } as unknown as Model<SocialFollow>,
      { countDocuments: connectionCount } as unknown as Model<SocialConnection>,
    );

    await expect(service.forOwner('owner-a')).rejects.toThrow(
      'database unavailable',
    );
  });
});
