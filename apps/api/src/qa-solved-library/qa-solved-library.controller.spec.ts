import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { QaSolvedLibraryController } from './qa-solved-library.controller';
import type { QaSolvedLibraryService } from './qa-solved-library.service';

describe('B169 solved questions route', () => {
  it('requires session, UUID subject and private no-store response', () => {
    expect(Reflect.getMetadata(PATH_METADATA, QaSolvedLibraryController)).toBe(
      'qa/discovery',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, QaSolvedLibraryController),
    ).toEqual([AuthSessionGuard]);
    const handler = Reflect.get(
      QaSolvedLibraryController.prototype,
      'list',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'solved-questions',
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });

    const argumentsMetadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      QaSolvedLibraryController,
      'list',
    ) as Record<string, { data?: string; pipes?: unknown[] }>;
    expect(
      Object.values(argumentsMetadata).some(
        (arg) => arg.data === 'subjectId' && (arg.pipes?.length ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it('uses the session viewer, not any caller-supplied user ID', async () => {
    const forSubject = jest.fn().mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const controller = new QaSolvedLibraryController({
      forSubject,
    } as unknown as QaSolvedLibraryService);
    const request = {
      user: { id: 'session-viewer' },
      query: { viewerId: 'other' },
      body: { userId: 'other' },
    } as unknown as AuthenticatedRequest;
    await expect(
      controller.list(request, 'subject-from-query', 'opaque-token'),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(forSubject).toHaveBeenCalledTimes(1);
    expect(forSubject).toHaveBeenCalledWith(
      'session-viewer',
      'subject-from-query',
      'opaque-token',
    );
  });
});
