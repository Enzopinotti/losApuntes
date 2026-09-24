import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/auth.types';
import { UsersService } from '../../users/users.service';

export const ORGANIZATIONS_VERIFY_PERMISSION = 'organizations:verify';

@Injectable()
export class OrganizationsVerifyGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const allowed = await this.users.hasPlatformPermission(
      request.user.id,
      ORGANIZATIONS_VERIFY_PERMISSION,
    );

    if (!allowed) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_VERIFICATION_FORBIDDEN',
        message: 'Organization verification permission required',
      });
    }

    return true;
  }
}
