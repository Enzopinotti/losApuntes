import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';

import type { UsersService } from '../../users/users.service';
import {
  ACADEMIC_CATALOG_WRITE_PERMISSION,
  AcademicAdminGuard,
} from './academic-admin.guard';

function context(userId = 'user-1'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: userId, email: 'user@example.test' } }),
    }),
  } as ExecutionContext;
}

describe('AcademicAdminGuard', () => {
  it('allows only the explicit academic catalog write permission', async () => {
    const hasPlatformPermission = jest.fn().mockResolvedValue(true);
    const users = { hasPlatformPermission } as unknown as UsersService;

    const guard = new AcademicAdminGuard(users);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(hasPlatformPermission).toHaveBeenCalledWith(
      'user-1',
      ACADEMIC_CATALOG_WRITE_PERMISSION,
    );
  });

  it('fails closed when permission is absent', async () => {
    const hasPlatformPermission = jest.fn().mockResolvedValue(false);
    const users = { hasPlatformPermission } as unknown as UsersService;

    const guard = new AcademicAdminGuard(users);

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
