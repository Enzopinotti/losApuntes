import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

import { getSessionCookieName } from '../session/session-cookie';
import { presentedSessionCredential } from '../session/session-credential';
import { AuthSessionGuard } from './auth-session.guard';

@Injectable()
export class OptionalAuthSessionGuard implements CanActivate {
  constructor(
    private readonly required: AuthSessionGuard,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const credential = presentedSessionCredential(
      request,
      getSessionCookieName(this.config.get<string>('NODE_ENV')),
    );

    if (!credential) return true;

    return this.required.canActivate(context);
  }
}
