import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { QaActivitySummaryController } from './qa-activity-summary.controller';
import type { QaActivitySummaryService } from './qa-activity-summary.service';

describe('B159 private Q&A summary HTTP route', () => {
  it('is a private non-cacheable authenticated endpoint', () => {
    expect(Reflect.getMetadata(PATH_METADATA, QaActivitySummaryController)).toBe(
      'qa/me',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, QaActivitySummaryController),
    ).toEqual([AuthSessionGuard]);

    const method = Reflect.get(
      QaActivitySummaryController.prototype,
      'getSummary',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('activity-summary');
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('never accepts an owner from client query or body', async () => {
    const result = {
      questionsTotal: 1,
      questionsOpen: 1,
      questionsClosed: 0,
      questionsOpenWithoutAcceptedAnswer: 1,
      answersVisible: 3,
      answersAccepted: 0,
    };
    const forOwner = jest.fn().mockResolvedValue(result);
    const controller = new QaActivitySummaryController({
      forOwner,
    } as unknown as QaActivitySummaryService);

    await expect(
      controller.getSummary({
        user: { id: 'session-owner' },
        query: { userId: 'attacker-selected' },
        body: { userId: 'attacker-selected' },
      } as unknown as AuthenticatedRequest),
    ).resolves.toEqual(result);
    expect(forOwner).toHaveBeenCalledTimes(1);
    expect(forOwner).toHaveBeenCalledWith('session-owner');
  });
});
