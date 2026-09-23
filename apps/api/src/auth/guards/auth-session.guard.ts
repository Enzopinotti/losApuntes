import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

import {
  credentialVersion,
  isAccountActive,
  isEmailVerified,
} from '../../users/user-security-state';
import { UsersService } from '../../users/users.service';
import type { AuthenticatedRequest } from '../auth.types';
import { AuthSessionService } from '../session/auth-session.service';
import { getSessionCookieName } from '../session/session-cookie';
import { presentedSessionCredential } from '../session/session-credential';

function authenticationRequired(): HttpException {
  return new HttpException(
    {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
    },
    HttpStatus.UNAUTHORIZED,
  );
}

function accountRestricted(): HttpException {
  return new HttpException(
    {
      code: 'ACCOUNT_RESTRICTED',
      message: 'Account access is restricted',
    },
    HttpStatus.FORBIDDEN,
  );
}

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(
    private readonly sessions: AuthSessionService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const credential = presentedSessionCredential(
      request,
      getSessionCookieName(this.config.get<string>('NODE_ENV')),
    );

    if (!credential) throw authenticationRequired();

    const resolved = await this.sessions.resolve(
      credential.sessionToken,
      credential.clientType,
    );

    if (!resolved) throw authenticationRequired();

    const user = await this.users.findById(resolved.userId);
    if (!user) {
      await this.sessions.revokeCurrent(credential.sessionToken);
      throw authenticationRequired();
    }

    if (!isAccountActive(user)) {
      await this.sessions.revokeCurrent(credential.sessionToken);
      throw accountRestricted();
    }

    const currentCredentialVersion = credentialVersion(user);

    if (resolved.credentialVersion !== currentCredentialVersion) {
      await this.sessions.revokeCurrent(credential.sessionToken);
      throw authenticationRequired();
    }

    const authenticatedRequest = request as AuthenticatedRequest;
    authenticatedRequest.user = {
      id: user._id.toString(),
      email: user.email,
      emailVerified: isEmailVerified(user),
    };
    authenticatedRequest.authSession = resolved.session;
    authenticatedRequest.authTransport = credential.clientType;
    authenticatedRequest.authCredentialVersion = currentCredentialVersion;

    return true;
  }
}
