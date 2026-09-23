import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/auth.types';
import { UsersService } from '../../users/users.service';

export const ACADEMIC_CATALOG_WRITE_PERMISSION = 'academic:catalog:write';

@Injectable()
export class AcademicAdminGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const allowed = await this.users.hasPlatformPermission(
      request.user.id,
      ACADEMIC_CATALOG_WRITE_PERMISSION,
    );

    if (!allowed) {
      throw new ForbiddenException({
        code: 'ACADEMIC_CATALOG_WRITE_FORBIDDEN',
        message: 'Academic catalog write permission required',
      });
    }

    return true;
  }
}
