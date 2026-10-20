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
import type { FollowersService } from './domain/followers.service';
import { FollowersPageDto } from './dto/followers-page.dto';
import { FollowersController } from './followers.controller';
import { SocialFollowSchema } from './mongo/social.mongo-schemas';
import './social.module';

describe('B148 private followers HTTP', () => {
  it('uses authenticated GET /social/me/followers and no-store on both routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, FollowersController)).toBe(
      'social/me/followers',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, FollowersController)).toEqual([
      AuthSessionGuard,
    ]);
    for (const [name, path] of [
      ['list', '/'],
      ['count', 'count'],
    ]) {
      const method = Reflect.get(FollowersController.prototype, name) as object;
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

  it('only supplies the authenticated principal, with no client owner selector', async () => {
    const list = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const count = jest.fn().mockResolvedValue({ followersCount: 0 });
    const controller = new FollowersController({
      list,
      count,
    } as unknown as FollowersService);
    const request = { user: { id: 'owner-a' } } as AuthenticatedRequest;
    const query = new FollowersPageDto();

    await expect(controller.list(request, query)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(list).toHaveBeenCalledWith('owner-a', 25, undefined);
    await expect(controller.count(request)).resolves.toEqual({
      followersCount: 0,
    });
    expect(count).toHaveBeenCalledWith('owner-a');
  });

  it('validates page limits and cursor length', () => {
    const dto = new FollowersPageDto();
    expect(validateSync(dto)).toHaveLength(0);
    dto.limit = 26;
    expect(validateSync(dto)).not.toHaveLength(0);
    dto.limit = 0;
    expect(validateSync(dto)).not.toHaveLength(0);
    dto.limit = 25;
    dto.cursor = 'a'.repeat(513);
    expect(validateSync(dto)).not.toHaveLength(0);
  });

  it('declares inbound follow index without changing B147 connection indexes', () => {
    expect(SocialFollowSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { followeeUserId: 1, createdAt: -1, id: 1 },
          { background: true },
        ],
      ]),
    );
  });

  it('propagates service faults rather than producing an empty page', async () => {
    const list = jest.fn().mockRejectedValue(new Error('storage-down'));
    const controller = new FollowersController({
      list,
    } as unknown as FollowersService);
    await expect(
      controller.list(
        { user: { id: 'owner-a' } } as AuthenticatedRequest,
        new FollowersPageDto(),
      ),
    ).rejects.toThrow('storage-down');
  });
});
