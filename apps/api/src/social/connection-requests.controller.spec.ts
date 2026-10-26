import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { validateSync } from 'class-validator';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { ConnectionRequestsDto } from './dto/connection-requests.dto';
import type { SocialService } from './domain/social.service';
import { SocialController } from './social.controller';

describe('B147 HTTP connection requests inbox', () => {
  it('requires authentication and private no-store on both GET routes', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SocialController)).toEqual([
      AuthSessionGuard,
    ]);
    for (const [methodName, path] of [
      ['connectionRequests', 'me/connection-requests'],
      ['incomingRequestCount', 'me/connection-requests/incoming-count'],
    ]) {
      const method = Reflect.get(
        SocialController.prototype,
        methodName,
      ) as object;
      expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
        RequestMethod.GET,
      );
      expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
        name: 'Cache-Control',
        value: 'private, no-store',
      });
    }
  });

  it('uses only the authenticated ID for listing and counting', async () => {
    const listConnectionRequests = jest.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const countIncomingConnectionRequests = jest
      .fn()
      .mockResolvedValue({ pendingIncomingCount: 2 });
    const ctrl = new SocialController({
      listConnectionRequests,
      countIncomingConnectionRequests,
    } as unknown as SocialService);
    const req = { user: { id: 'owner-a' } } as AuthenticatedRequest;
    const dto = new ConnectionRequestsDto();

    await expect(ctrl.connectionRequests(req, dto)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(listConnectionRequests).toHaveBeenCalledWith(
      'owner-a',
      'incoming',
      25,
      undefined,
    );
    await expect(ctrl.incomingRequestCount(req)).resolves.toEqual({
      pendingIncomingCount: 2,
    });
    expect(countIncomingConnectionRequests).toHaveBeenCalledWith('owner-a');
  });

  it('validates direction, page budget and cursor size at the HTTP boundary', () => {
    const dto = new ConnectionRequestsDto();
    expect(validateSync(dto)).toHaveLength(0);
    dto.direction = 'outgoing';
    expect(validateSync(dto)).toHaveLength(0);
    dto.direction = 'both' as never;
    expect(validateSync(dto)).not.toHaveLength(0);
    dto.direction = 'incoming';
    dto.limit = 26;
    expect(validateSync(dto)).not.toHaveLength(0);
    dto.limit = 25;
    dto.cursor = 'X'.repeat(513);
    expect(validateSync(dto)).not.toHaveLength(0);
  });

  it('propagates backend outages instead of reporting an empty inbox', async () => {
    const listConnectionRequests = jest
      .fn()
      .mockRejectedValue(new Error('mongo-offline'));
    const ctrl = new SocialController({
      listConnectionRequests,
    } as unknown as SocialService);
    await expect(
      ctrl.connectionRequests(
        { user: { id: 'owner-a' } } as AuthenticatedRequest,
        new ConnectionRequestsDto(),
      ),
    ).rejects.toThrow('mongo-offline');
  });
});
