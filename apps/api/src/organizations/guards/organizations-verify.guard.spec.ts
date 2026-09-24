import { ExecutionContext, ForbiddenException } from '@nestjs/common';

import type { UsersService } from '../../users/users.service';
import {
  ORGANIZATIONS_VERIFY_PERMISSION,
  OrganizationsVerifyGuard,
} from './organizations-verify.guard';

function context(userId = 'user-1'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          id: userId,
          email: 'user@example.test',
          emailVerified: true,
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('OrganizationsVerifyGuard', () => {
  it('allows explicit organizations:verify permission', async () => {
    const users = {
      hasPlatformPermission: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<UsersService>;
    const guard = new OrganizationsVerifyGuard(users);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(users.hasPlatformPermission).toHaveBeenCalledWith(
      'user-1',
      ORGANIZATIONS_VERIFY_PERMISSION,
    );
  });

  it('denies managers without platform verification permission', async () => {
    const users = {
      hasPlatformPermission: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<UsersService>;
    const guard = new OrganizationsVerifyGuard(users);

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
