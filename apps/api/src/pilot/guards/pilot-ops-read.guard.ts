import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/auth.types';
import { UsersService } from '../../users/users.service';

export const PILOT_OPS_READ_PERMISSION = 'pilot:ops:read';

@Injectable()
export class PilotOpsReadGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const allowed = await this.users.hasPlatformPermission(
      request.user.id,
      PILOT_OPS_READ_PERMISSION,
    );

    if (!allowed) {
      throw new ForbiddenException({
        code: 'PILOT_OPS_READ_FORBIDDEN',
        message: 'Pilot operations read permission required',
      });
    }

    return true;
  }
}
