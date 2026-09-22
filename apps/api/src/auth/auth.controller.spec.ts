import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { AuthSessionService } from './session/auth-session.service';
import type { SessionCookieOptions } from './session/session-cookie';

const SESSION = {
  id: '93b0d36e-a992-487f-b9ba-1173c47800f7',
  clientType: 'web' as const,
  createdAt: '2026-09-22T12:00:00.000Z',
  lastSeenAt: '2026-09-22T12:00:00.000Z',
  expiresAt: '2026-10-22T12:00:00.000Z',
  current: true,
};

const USER = {
  id: 'user-1',
  email: 'enzo@example.com',
};

describe('AuthController', () => {
  const register = jest.fn();
  const login = jest.fn();
  const revokeCurrent = jest.fn();
  const listForUser = jest.fn();
  const revokeOwned = jest.fn();
  const revokeAll = jest.fn();

  const authService = {
    register,
    login,
  } as unknown as AuthService;

  const sessionService = {
    revokeCurrent,
    listForUser,
    revokeOwned,
    revokeAll,
  } as unknown as AuthSessionService;

  const config = new ConfigService({
    NODE_ENV: 'development',
  });

  const controller = new AuthController(authService, sessionService, config);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers without issuing an authenticated session', async () => {
    register.mockResolvedValue(undefined);

    await expect(
      controller.register({
        email: 'enzo@example.com',
        password: 'correct-horse-battery',
      }),
    ).resolves.toEqual({ accepted: true });

    expect(register).toHaveBeenCalledWith({
      email: 'enzo@example.com',
      password: 'correct-horse-battery',
    });
    expect(login).not.toHaveBeenCalled();
  });

  it('puts the Web bearer only in the HttpOnly cookie contract', async () => {
    login.mockResolvedValue({
      user: USER,
      sessionToken: 'a'.repeat(43),
      session: SESSION,
    });
    const setCookie = jest.fn<
      void,
      [string, string, SessionCookieOptions]
    >();
    const reply = {
      setCookie,
    } as unknown as FastifyReply;

    await expect(
      controller.login(
        {
          email: 'enzo@example.com',
          password: 'correct-horse-battery',
        },
        reply,
      ),
    ).resolves.toEqual({
      user: USER,
      session: SESSION,
    });

    expect(setCookie.mock.calls).toHaveLength(1);
    expect(setCookie.mock.calls[0]?.[0]).toBe('losapuntes_session');
    expect(setCookie.mock.calls[0]?.[1]).toBe('a'.repeat(43));
    expect(setCookie.mock.calls[0]?.[2]).toMatchObject({
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });
  });

  it('returns the opaque bearer only from the native login contract', async () => {
    const mobileSession = {
      ...SESSION,
      clientType: 'mobile' as const,
    };
    const result = {
      user: USER,
      sessionToken: 'b'.repeat(43),
      session: mobileSession,
    };
    login.mockResolvedValue(result);

    await expect(
      controller.mobileLogin({
        email: 'enzo@example.com',
        password: 'correct-horse-battery',
      }),
    ).resolves.toEqual(result);

    expect(login).toHaveBeenCalledWith(
      {
        email: 'enzo@example.com',
        password: 'correct-horse-battery',
      },
      'mobile',
    );
  });

  it('rejects invalid Web credentials without setting a cookie', async () => {
    login.mockResolvedValue(null);
    const setCookie = jest.fn();
    const reply = {
      setCookie,
    } as unknown as FastifyReply;

    await expect(
      controller.login(
        {
          email: 'missing@example.com',
          password: 'incorrect-password',
        },
        reply,
      ),
    ).rejects.toThrow('Invalid credentials');

    expect(setCookie).not.toHaveBeenCalled();
  });

  it('revokes a presented Web session and always clears the cookie', async () => {
    revokeCurrent.mockResolvedValue(undefined);
    const clearCookie = jest.fn();
    const request = {
      headers: {},
      cookies: {
        losapuntes_session: 'c'.repeat(43),
      },
    } as unknown as FastifyRequest;
    const reply = {
      clearCookie,
    } as unknown as FastifyReply;

    await controller.logout(request, reply);

    expect(revokeCurrent).toHaveBeenCalledWith('c'.repeat(43));
    expect(clearCookie).toHaveBeenCalledWith(
      'losapuntes_session',
      expect.objectContaining({
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      }),
    );
  });
});
