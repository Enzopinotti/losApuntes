import {
  ForbiddenException,
  type ExecutionContext,
} from '@nestjs/common';

import type { UsersService } from '../../users/users.service';
import { ModerationWriteGuard } from './moderation-write.guard';
import { PilotOpsReadGuard } from './pilot-ops-read.guard';

function context(userId = 'user-1'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: userId } }),
    }),
  } as unknown as ExecutionContext;
}

function users(allowed: boolean) {
  return {
    hasPlatformPermission: jest.fn().mockResolvedValue(allowed),
  } as unknown as jest.Mocked<UsersService>;
}

describe('Pilot operation guards', () => {
  it('allows pilot reads only with the explicit platform permission', async () => {
    const userService = users(true);
    const guard = new PilotOpsReadGuard(userService);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(userService.hasPlatformPermission).toHaveBeenCalledWith(
      'user-1',
      'pilot:ops:read',
    );
  });

  it('fails pilot reads closed without permission', async () => {
    const guard = new PilotOpsReadGuard(users(false));

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows moderation writes only with the explicit platform permission', async () => {
    const userService = users(true);
    const guard = new ModerationWriteGuard(userService);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(userService.hasPlatformPermission).toHaveBeenCalledWith(
      'user-1',
      'moderation:write',
    );
  });

  it('fails moderation writes closed without permission', async () => {
    const guard = new ModerationWriteGuard(users(false));

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
