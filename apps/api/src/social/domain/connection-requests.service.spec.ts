import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { PilotEventService } from '../../pilot/telemetry/pilot-event.service';
import type { ProfileService } from '../../profile/domain/profile.service';
import { encodeConnectionRequestCursor } from './connection-request.cursor';
import type { SocialStore } from './social.store';
import { SocialService } from './social.service';
import type { ConnectionRecord } from './social.types';

const now = new Date('2026-10-20T00:00:00.000Z');
const id = '11111111-1111-4111-8111-111111111111';

function record(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    id,
    userLowId: 'owner-a',
    userHighId: 'other-b',
    requestedByUserId: 'other-b',
    status: 'pending',
    respondedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function setup(rows: ConnectionRecord[] = []) {
  const listConnections = jest.fn().mockResolvedValue(rows);
  const countIncomingConnectionRequests = jest.fn().mockResolvedValue(3);
  const getAttributionForUser = jest.fn().mockResolvedValue({
    profileId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Otro estudiante',
    avatarUrl: null,
  });
  const service = new SocialService(
    {
      listConnections,
      countIncomingConnectionRequests,
    } as unknown as SocialStore,
    { getAttributionForUser } as unknown as ProfileService,
    {} as PilotEventService,
  );
  return {
    service,
    listConnections,
    countIncomingConnectionRequests,
    getAttributionForUser,
  };
}

describe('B147 connection requests inbox domain', () => {
  it('lists only incoming pending requests, maps safe profiles and paginates', async () => {
    const { service, listConnections, getAttributionForUser } = setup([
      record(),
      record({ id: '33333333-3333-4333-8333-333333333333' }),
    ]);
    const result = await service.listConnectionRequests(
      'owner-a',
      'incoming',
      1,
    );
    expect(listConnections).toHaveBeenCalledWith(
      'owner-a',
      'pending',
      2,
      undefined,
      'incoming',
    );
    expect(result.items).toEqual([
      {
        id,
        status: 'pending',
        other: {
          profileId: '22222222-2222-4222-8222-222222222222',
          displayName: 'Otro estudiante',
          avatarUrl: null,
        },
        requestedByMe: false,
        incoming: true,
        respondedAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]);
    expect(getAttributionForUser).toHaveBeenCalledWith('other-b');
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toContain('owner-a');
    expect(JSON.stringify(result)).not.toContain('other-b');
  });

  it('lists outgoing pending requests without changing the existing projection', async () => {
    const { service, listConnections } = setup([
      record({ requestedByUserId: 'owner-a' }),
    ]);
    const result = await service.listConnectionRequests(
      'owner-a',
      'outgoing',
      25,
    );
    expect(listConnections).toHaveBeenCalledWith(
      'owner-a',
      'pending',
      26,
      undefined,
      'outgoing',
    );
    expect(result.items[0]).toMatchObject({
      requestedByMe: true,
      incoming: false,
    });
    expect(result.nextCursor).toBeNull();
  });

  it('uses an owner+direction cursor without accepting another user or view', async () => {
    const { service, listConnections } = setup([]);
    const cursor = encodeConnectionRequestCursor('owner-a', 'incoming', {
      id,
      at: now,
    });
    await expect(
      service.listConnectionRequests('owner-a', 'incoming', 25, cursor),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(listConnections).toHaveBeenCalledWith(
      'owner-a',
      'pending',
      26,
      { at: now, id },
      'incoming',
    );
    await expect(
      service.listConnectionRequests('owner-b', 'incoming', 25, cursor),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.listConnectionRequests('owner-a', 'outgoing', 25, cursor),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(listConnections).toHaveBeenCalledTimes(1);
  });

  it('rejects impossible paging and invalid datastore rows before profile lookup', async () => {
    const { service, listConnections, getAttributionForUser } = setup([
      record({ userLowId: 'not-owner', userHighId: 'somebody' }),
    ]);
    for (const limit of [0, 26, -1, Number.NaN, 1.5]) {
      await expect(
        service.listConnectionRequests('owner-a', 'incoming', limit),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    expect(listConnections).not.toHaveBeenCalled();
    await expect(
      service.listConnectionRequests('owner-a', 'incoming', 25),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(getAttributionForUser).not.toHaveBeenCalled();
  });

  it('never projects incorrect status or reversed request direction', async () => {
    for (const row of [
      record({ status: 'accepted' }),
      record({ requestedByUserId: 'owner-a' }),
      record({ requestedByUserId: 'unrelated-c' }),
      record({ updatedAt: new Date(Number.NaN) }),
    ]) {
      const { service, getAttributionForUser } = setup([row]);
      await expect(
        service.listConnectionRequests('owner-a', 'incoming', 25),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(getAttributionForUser).not.toHaveBeenCalled();
    }
  });

  it('returns a scoped incoming pending count, including zero and real datastore failures', async () => {
    const { service, countIncomingConnectionRequests, listConnections } =
      setup();
    await expect(service.countIncomingConnectionRequests('owner-a')).resolves
      .toEqual({ pendingIncomingCount: 3 });
    expect(countIncomingConnectionRequests).toHaveBeenCalledWith('owner-a');
    countIncomingConnectionRequests.mockResolvedValue(0);
    await expect(service.countIncomingConnectionRequests('owner-a')).resolves
      .toEqual({ pendingIncomingCount: 0 });
    expect(listConnections).not.toHaveBeenCalled();
    countIncomingConnectionRequests.mockResolvedValue(-1);
    await expect(service.countIncomingConnectionRequests('owner-a')).rejects
      .toBeInstanceOf(ServiceUnavailableException);
    countIncomingConnectionRequests.mockRejectedValue(new Error('mongo-down'));
    await expect(service.countIncomingConnectionRequests('owner-a')).rejects
      .toThrow('mongo-down');
  });
});
