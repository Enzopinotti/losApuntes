import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { QaHelpOpportunitiesController } from './qa-help-opportunities.controller';
import type { QaHelpOpportunitiesService } from './qa-help-opportunities.service';

describe('B167 current subject opportunities endpoint', () => {
  it('protects user participation with session guard and no-store cache', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, QaHelpOpportunitiesController),
    ).toBe('qa/me');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, QaHelpOpportunitiesController),
    ).toEqual([AuthSessionGuard]);
    const method = Reflect.get(
      QaHelpOpportunitiesController.prototype,
      'list',
    ) as object;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(
      'help-opportunities',
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, method)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('never trusts a client-supplied owner user ID', async () => {
    const forOwner = jest.fn().mockResolvedValue({
      items: [],
      hasMoreSubjects: false,
    });
    const controller = new QaHelpOpportunitiesController({
      forOwner,
    } as unknown as QaHelpOpportunitiesService);

    await controller.list({
      user: { id: 'authenticated-student' },
      query: { ownerId: 'another-student' },
      body: { userId: 'another-student' },
    } as unknown as AuthenticatedRequest);
    expect(forOwner).toHaveBeenCalledTimes(1);
    expect(forOwner).toHaveBeenCalledWith('authenticated-student');
  });
});
