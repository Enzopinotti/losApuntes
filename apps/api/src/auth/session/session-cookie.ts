export const WEB_SESSION_COOKIE_DEV = 'losapuntes_session';
export const WEB_SESSION_COOKIE_PROD = '__Host-losapuntes_session';

export type SessionCookieOptions = {
  path: '/';
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  expires?: Date;
};

export function getSessionCookieName(nodeEnv?: string): string {
  return nodeEnv === 'production'
    ? WEB_SESSION_COOKIE_PROD
    : WEB_SESSION_COOKIE_DEV;
}

export function getSessionCookieOptions(
  nodeEnv: string | undefined,
  expiresAt: string,
): SessionCookieOptions {
  return {
    path: '/',
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
    expires: new Date(expiresAt),
  };
}

export function getSessionCookieClearOptions(
  nodeEnv?: string,
): SessionCookieOptions {
  return {
    path: '/',
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
  };
}
