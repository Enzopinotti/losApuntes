import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { validateSync } from 'class-validator';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { QaCardStatusController } from './qa-card-status.controller';
import { BatchQaCardStatusDto } from './qa-card-status.dto';
import type { QaCardStatusService } from './qa-card-status.service';

const ID = '269f2da7-f70c-418d-9151-000000000001';

describe('B168 Q&A batch refresh HTTP contract', () => {
  it('protects the route with session authentication and private no-store', () => {
    expect(Reflect.getMetadata(PATH_METADATA, QaCardStatusController)).toBe(
      'qa/discovery',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, QaCardStatusController)).toEqual(
      [AuthSessionGuard],
    );
    const method = Reflect.get(
      QaCardStatusController.prototype,
      'refresh',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(
      'batch-question-status',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(1);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, method)).toBe(200);
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('uses the validated session as the only viewer authority', async () => {
    const forViewer = jest.fn().mockResolvedValue({ items: [] });
    const controller = new QaCardStatusController({
      forViewer,
    } as unknown as QaCardStatusService);
    const dto = Object.assign(new BatchQaCardStatusDto(), {
      questionIds: [ID],
    });
    await expect(
      controller.refresh(
        {
          user: { id: 'session-user' },
          query: { userId: 'another-user' },
        } as unknown as AuthenticatedRequest,
        dto,
      ),
    ).resolves.toEqual({ items: [] });
    expect(forViewer).toHaveBeenCalledWith('session-user', dto);
    expect(forViewer).toHaveBeenCalledTimes(1);
  });

  it.each([
    [],
    [ID, ID],
    Array.from({ length: 21 }, (_, index) =>
      '269f2da7-f70c-418d-9151-' + String(index + 1).padStart(12, '0'),
    ),
    ['not-uuid'],
    [3],
  ])('rejects malformed question arrays in DTO', (questionIds) => {
    const dto = Object.assign(new BatchQaCardStatusDto(), { questionIds });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('accepts a well-formed single question ID in DTO', () => {
    const dto = Object.assign(new BatchQaCardStatusDto(), {
      questionIds: [ID],
    });
    expect(validateSync(dto)).toEqual([]);
  });
});
