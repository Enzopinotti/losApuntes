import {
  getSessionCookieClearOptions,
  getSessionCookieName,
  getSessionCookieOptions,
  WEB_SESSION_COOKIE_DEV,
  WEB_SESSION_COOKIE_PROD,
} from './session-cookie';

describe('session cookie contract', () => {
  it('uses the __Host- prefix only for production', () => {
    expect(getSessionCookieName('production')).toBe(WEB_SESSION_COOKIE_PROD);
    expect(getSessionCookieName('development')).toBe(WEB_SESSION_COOKIE_DEV);
  });

  it('uses host-only HttpOnly SameSite=Lax Secure production cookies', () => {
    const expiresAt = '2026-10-22T12:00:00.000Z';

    expect(getSessionCookieOptions('production', expiresAt)).toEqual({
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expires: new Date(expiresAt),
    });
  });

  it('keeps local HTTP development usable without weakening production', () => {
    expect(
      getSessionCookieOptions(
        'development',
        '2026-10-22T12:00:00.000Z',
      ).secure,
    ).toBe(false);
    expect(getSessionCookieClearOptions('production').secure).toBe(true);
  });
});
