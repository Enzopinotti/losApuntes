import type { FastifyRequest } from 'fastify';

import type { AuthClientType } from './auth-session.types';
import { isSessionToken } from './session-token';

export type PresentedSessionCredential = {
  sessionToken: string;
  clientType: AuthClientType;
};

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;

  const [scheme, token, extra] = authorization.split(' ');

  if (
    scheme !== 'Bearer' ||
    !token ||
    extra !== undefined ||
    !isSessionToken(token)
  ) {
    return null;
  }

  return token;
}

export function presentedSessionCredential(
  request: FastifyRequest,
  cookieName: string,
): PresentedSessionCredential | null {
  const cookieToken = request.cookies?.[cookieName];
  const hasAuthorizationHeader = request.headers.authorization !== undefined;
  const nativeToken = bearerToken(request.headers.authorization);

  if (cookieToken && hasAuthorizationHeader) return null;

  if (cookieToken) {
    return isSessionToken(cookieToken)
      ? { sessionToken: cookieToken, clientType: 'web' }
      : null;
  }

  return nativeToken
    ? { sessionToken: nativeToken, clientType: 'mobile' }
    : null;
}
