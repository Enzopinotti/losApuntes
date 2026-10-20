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
import type { QaMyAnswersService } from './domain/qa-my-answers.service';
import { MyAnswersQueryDto } from './dto/qa-my-answers.dto';
import { AnswerSchema } from './mongo/qa.mongo-schemas';
import { QaMyAnswersController } from './qa-my-answers.controller';

describe('B146 private answer-history HTTP', () => {
  it('requires an Auth session and no-store cache for GET /answers/mine', () => {
    const method = Reflect.get(
      QaMyAnswersController.prototype,
      'list',
    ) as object;

    expect(Reflect.getMetadata(PATH_METADATA, QaMyAnswersController)).toBe(
      'answers',
    );
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('mine');
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, QaMyAnswersController)).toEqual([
      AuthSessionGuard,
    ]);
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('passes authenticated principal only and does not load public answers', async () => {
    const list = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const controller = new QaMyAnswersController({
      list,
    } as unknown as QaMyAnswersService);
    const query = { limit: 10 };
    const request = { user: { id: 'owner-a' } } as AuthenticatedRequest;

    await expect(controller.list(request, query)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith('owner-a', query);
  });

  it('rejects oversized page queries and retains default 25', () => {
    const input = new MyAnswersQueryDto();
    expect(input.limit).toBe(25);
    input.limit = 26;
    expect(validateSync(input)).not.toHaveLength(0);
    input.limit = 0;
    expect(validateSync(input)).not.toHaveLength(0);
    input.limit = 25;
    expect(validateSync(input)).toHaveLength(0);
  });

  it('declares an owner+moderation+date+id compound index', () => {
    const index = {
      authorUserId: 1,
      moderationState: 1,
      createdAt: -1,
      id: 1,
    };
    expect(AnswerSchema.indexes()).toEqual(
      expect.arrayContaining([[index, { background: true }]]),
    );
  });

  it('propagates database faults rather than producing fake empty results', async () => {
    const list = jest.fn().mockRejectedValue(new Error('mongo-down'));
    const controller = new QaMyAnswersController({
      list,
    } as unknown as QaMyAnswersService);
    await expect(
      controller.list(
        { user: { id: 'owner-a' } } as AuthenticatedRequest,
        { limit: 25 },
      ),
    ).rejects.toThrow('mongo-down');
  });
});
