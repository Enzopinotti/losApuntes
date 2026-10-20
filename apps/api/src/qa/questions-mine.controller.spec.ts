import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import type { QaService } from './domain/qa.service';
import { QuestionsController } from './questions.controller';

describe('B145 own questions HTTP route', () => {
  it('requires authenticated owner and disables intermediary caching', () => {
    const method = Reflect.get(QuestionsController.prototype, 'mine') as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('questions/mine');
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, method)).toEqual([
      AuthSessionGuard,
    ]);
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('uses the authenticated principal rather than a client-supplied author', async () => {
    const mine = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new QuestionsController({ mine } as unknown as QaService);
    const query = { status: 'open' as const, limit: 25 };
    const request = { user: { id: 'owner-a' } } as AuthenticatedRequest;

    await expect(controller.mine(request, query)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(mine).toHaveBeenCalledTimes(1);
    expect(mine).toHaveBeenCalledWith('owner-a', query);
  });

  it('does not mask service failures as an empty page', async () => {
    const mine = jest.fn().mockRejectedValue(new Error('db-down'));
    const controller = new QuestionsController({ mine } as unknown as QaService);
    await expect(
      controller.mine(
        { user: { id: 'owner-a' } } as AuthenticatedRequest,
        { limit: 25 },
      ),
    ).rejects.toThrow('db-down');
  });
});
