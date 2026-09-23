import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/auth.types';
import { UsersService } from '../../users/users.service';

export const MODERATION_WRITE_PERMISSION = 'moderation:write';

@Injectable()
export class ModerationWriteGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const allowed = await this.users.hasPlatformPermission(
      request.user.id,
      MODERATION_WRITE_PERMISSION,
    );

    if (!allowed) {
      throw new ForbiddenException({
        code: 'MODERATION_WRITE_FORBIDDEN',
        message: 'Moderation write permission required',
      });
    }

    return true;
  }
}
