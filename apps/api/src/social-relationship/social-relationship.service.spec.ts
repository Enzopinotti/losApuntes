import {
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ProfileService } from '../profile/domain/profile.service';
import { SocialRelationshipService } from './social-relationship.service';

const profileId = '11111111-1111-4111-8111-111111111111';
const connectionId = '22222222-2222-4222-8222-222222222222';
const respondedAt = new Date('2026-10-20T15:30:00.000Z');

function query<T>(row: T) {
  const exec = jest.fn().mockResolvedValue(row);
  const lean = jest.fn().mockReturnValue({ exec });
  const select = jest.fn().mockReturnValue({ lean });
  return { select, lean, exec };
}

function fixture(
  options: {
    viewer?: string;
    target?: string | null;
    outgoing?: unknown;
    incoming?: unknown;
    connection?: unknown;
    profileError?: Error;
  } = {},
) {
  const viewer = options.viewer ?? 'viewer-a';
  const target = options.target === undefined ? 'target-b' : options.target;
  const outgoingRow = query(
    options.outgoing === undefined ? null : options.outgoing,
  );
  const incomingRow = query(
    options.incoming === undefined ? null : options.incoming,
  );
  const connectionRow = query(
    options.connection === undefined ? null : options.connection,
  );
  const follows = {
    findOne: jest
      .fn()
      .mockReturnValueOnce(outgoingRow)
      .mockReturnValueOnce(incomingRow),
  };
  const connections = {
    findOne: jest.fn().mockReturnValue(connectionRow),
  };
  const getPublicProfile = jest.fn().mockResolvedValue({ profile: { id: profileId } });
  if (options.profileError) getPublicProfile.mockRejectedValue(options.profileError);
  const resolveUserIdByProfileId = jest.fn().mockResolvedValue(target);
  const service = new SocialRelationshipService(
    follows as never,
    connections as never,
    {
      getPublicProfile,
      resolveUserIdByProfileId,
    } as unknown as ProfileService,
  );
  return {
    service,
    viewer,
    target,
    follows,
    connections,
    getPublicProfile,
    resolveUserIdByProfileId,
    outgoingRow,
    incomingRow,
    connectionRow,
  };
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: connectionId,
    userLowId: 'target-b',
    userHighId: 'viewer-a',
    requestedByUserId: 'target-b',
    status: 'pending',
    respondedAt: null,
    privateField: 'must-not-leak',
    ...overrides,
  };
}

describe('B150 profile relationship snapshot', () => {
  it('returns a stable empty relationship for an unrelated public profile', async () => {
    const f = fixture();
    await expect(f.service.get(f.viewer, profileId)).resolves.toEqual({
      isSelf: false,
      isFollowing: false,
      followsYou: false,
      connection: null,
    });
    expect(f.getPublicProfile).toHaveBeenCalledWith(profileId);
    expect(f.resolveUserIdByProfileId).toHaveBeenCalledWith(profileId);
    expect(f.follows.findOne).toHaveBeenCalledTimes(2);
    expect(f.connections.findOne).toHaveBeenCalledWith({
      userLowId: 'target-b',
      userHighId: 'viewer-a',
    });
  });

  it('returns own profile state without querying social relations', async () => {
    const f = fixture({ target: 'viewer-a' });
    await expect(f.service.get('viewer-a', profileId)).resolves.toEqual({
      isSelf: true,
      isFollowing: false,
      followsYou: false,
      connection: null,
    });
    expect(f.follows.findOne).not.toHaveBeenCalled();
    expect(f.connections.findOne).not.toHaveBeenCalled();
  });

  it('reads reciprocal follow directions and an actionable incoming request', async () => {
    const f = fixture({
      outgoing: { followerUserId: 'viewer-a', followeeUserId: 'target-b' },
      incoming: { followerUserId: 'target-b', followeeUserId: 'viewer-a' },
      connection: connection(),
    });
    const snapshot = await f.service.get('viewer-a', profileId);

    expect(snapshot).toEqual({
      isSelf: false,
      isFollowing: true,
      followsYou: true,
      connection: {
        id: connectionId,
        status: 'pending',
        requestedByMe: false,
        incoming: true,
        respondedAt: null,
      },
    });
    expect(f.follows.findOne).toHaveBeenNthCalledWith(1, {
      followerUserId: 'viewer-a',
      followeeUserId: 'target-b',
    });
    expect(f.follows.findOne).toHaveBeenNthCalledWith(2, {
      followerUserId: 'target-b',
      followeeUserId: 'viewer-a',
    });
    expect(f.outgoingRow.select).toHaveBeenCalledWith({
      _id: 0,
      followerUserId: 1,
      followeeUserId: 1,
    });
    expect(f.connectionRow.select).toHaveBeenCalledWith({
      _id: 0,
      id: 1,
      userLowId: 1,
      userHighId: 1,
      requestedByUserId: 1,
      status: 1,
      respondedAt: 1,
    });
    expect(JSON.stringify(snapshot)).not.toContain('viewer-a');
    expect(JSON.stringify(snapshot)).not.toContain('target-b');
    expect(JSON.stringify(snapshot)).not.toContain('privateField');
  });

  it('reports outbound and already accepted connections without inventing actions', async () => {
    const f = fixture({
      connection: connection({
        status: 'accepted',
        requestedByUserId: 'viewer-a',
        respondedAt,
      }),
    });
    const snapshot = await f.service.get('viewer-a', profileId);
    expect(snapshot.connection).toEqual({
      id: connectionId,
      status: 'accepted',
      requestedByMe: true,
      incoming: false,
      respondedAt: respondedAt.toISOString(),
    });
  });

  it('uses the existing ordered-pair key for inverse lexical account order', async () => {
    const f = fixture({
      viewer: 'alpha',
      target: 'zeta',
      connection: {
        ...connection(),
        userLowId: 'alpha',
        userHighId: 'zeta',
        requestedByUserId: 'alpha',
      },
    });
    const snapshot = await f.service.get('alpha', profileId);
    expect(f.connections.findOne).toHaveBeenCalledWith({
      userLowId: 'alpha',
      userHighId: 'zeta',
    });
    expect(snapshot.connection).toMatchObject({
      requestedByMe: true,
      incoming: false,
    });
  });

  it('honors public profile lifecycle and missing profiles before touching Mongo', async () => {
    const f = fixture({ profileError: new NotFoundException('closed') });
    await expect(f.service.get('viewer-a', profileId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(f.resolveUserIdByProfileId).not.toHaveBeenCalled();
    expect(f.follows.findOne).not.toHaveBeenCalled();
    const missing = fixture({ target: null });
    await expect(
      missing.service.get('viewer-a', profileId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(missing.follows.findOne).not.toHaveBeenCalled();
  });

  it('rejects missing principal before any profile query', async () => {
    const f = fixture();
    await expect(f.service.get('', profileId)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(f.getPublicProfile).not.toHaveBeenCalled();
  });

  it('fails closed on crossed follow edges or malformed persisted connection', async () => {
    for (const state of [
      { outgoing: { followerUserId: 'other', followeeUserId: 'target-b' } },
      { incoming: { followerUserId: 'target-b', followeeUserId: 'other' } },
      { connection: connection({ userLowId: 'other' }) },
      { connection: connection({ requestedByUserId: 'stranger' }) },
      { connection: connection({ id: 'not-a-uuid' }) },
      { connection: connection({ status: 'unknown' }) },
      { connection: connection({ status: 'pending', respondedAt }) },
      { connection: connection({ status: 'accepted', respondedAt: 'invalid' }) },
    ]) {
      const f = fixture(state);
      await expect(f.service.get('viewer-a', profileId)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('propagates Mongo outages, never substituting false relationship flags', async () => {
    const f = fixture();
    f.connectionRow.exec.mockRejectedValue(new Error('mongo-down'));
    await expect(f.service.get('viewer-a', profileId)).rejects.toThrow(
      'mongo-down',
    );
  });
});
