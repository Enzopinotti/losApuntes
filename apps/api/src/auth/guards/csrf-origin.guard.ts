import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

import { getSessionCookieName } from '../session/session-cookie';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    if (!UNSAFE_METHODS.has(request.method)) return true;

    const cookieName = getSessionCookieName(
      this.config.get<string>('NODE_ENV'),
    );
    const hasSessionCookie = request.cookies?.[cookieName] !== undefined;

    if (!hasSessionCookie) return true;

    const expectedOrigin = this.config.get<string>('WEB_ORIGIN');
    if (!expectedOrigin || request.headers.origin !== expectedOrigin) {
      throw new ForbiddenException({
        code: 'CSRF_VALIDATION_FAILED',
        message: 'Forbidden',
      });
    }

    return true;
  }
}
