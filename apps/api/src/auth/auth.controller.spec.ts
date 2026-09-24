import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AbuseControlService } from '../abuse-control/domain/abuse-control.service';
import type { AccountSecurityService } from './account-security.service';
import type { AuthAuditService } from './audit/auth-audit.service';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import { AuthEmailDeliveryUnavailableError } from './lifecycle/auth-lifecycle.errors';
import type { AuthLifecycleService } from './lifecycle/auth-lifecycle.service';
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

const PUBLIC_REQUEST = {
  ip: '127.0.0.1',
} as unknown as FastifyRequest;

async function rejectedHttpException(
  operation: Promise<unknown>,
): Promise<HttpException> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof HttpException) {
      return error;
    }
    throw error;
  }

  throw new Error('Expected operation to reject with HttpException');
}

describe('AuthController', () => {
  const enforceAbuseControl = jest.fn();
  const register = jest.fn();
  const login = jest.fn();
  const requestEmailVerification = jest.fn();
  const inspectEmailVerification = jest.fn();
  const completeEmailVerification = jest.fn();
  const requestPasswordRecovery = jest.fn();
  const inspectPasswordRecovery = jest.fn();
  const completePasswordRecovery = jest.fn();
  const revokeCurrent = jest.fn();
  const listForUser = jest.fn();
  const revokeOwned = jest.fn();
  const revokeAll = jest.fn();
  const changePassword = jest.fn();
  const auditRecord = jest.fn();

  const abuseControl = {
    enforce: enforceAbuseControl,
  } as unknown as AbuseControlService;

  const authService = {
    register,
    login,
  } as unknown as AuthService;

  const lifecycle = {
    requestEmailVerification,
    inspectEmailVerification,
    completeEmailVerification,
    requestPasswordRecovery,
    inspectPasswordRecovery,
    completePasswordRecovery,
  } as unknown as AuthLifecycleService;

  const security = {
    changePassword,
  } as unknown as AccountSecurityService;

  const sessionService = {
    revokeCurrent,
    listForUser,
    revokeOwned,
    revokeAll,
  } as unknown as AuthSessionService;

  const audit = {
    record: auditRecord,
  } as unknown as AuthAuditService;

  const config = new ConfigService({
    NODE_ENV: 'development',
  });

  const controller = new AuthController(
    abuseControl,
    authService,
    lifecycle,
    security,
    sessionService,
    audit,
    config,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    enforceAbuseControl.mockResolvedValue(undefined);
  });

  it('registers without issuing an authenticated session', async () => {
    register.mockResolvedValue(undefined);

    await expect(
      controller.register(PUBLIC_REQUEST, {
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

  it('keeps registration bounded when verification delivery fails', async () => {
    register.mockRejectedValue(new AuthEmailDeliveryUnavailableError());

    await expect(
      controller.register(PUBLIC_REQUEST, {
        email: 'enzo@example.com',
        password: 'correct-horse-battery',
      }),
    ).resolves.toEqual({ accepted: true });
  });

  it('keeps verification request bounded when delivery fails', async () => {
    requestEmailVerification.mockRejectedValue(
      new AuthEmailDeliveryUnavailableError(),
    );

    await expect(
      controller.requestEmailVerification(PUBLIC_REQUEST, {
        email: 'enzo@example.com',
      }),
    ).resolves.toEqual({ accepted: true });
  });

  it('keeps recovery request bounded when delivery fails', async () => {
    requestPasswordRecovery.mockRejectedValue(
      new AuthEmailDeliveryUnavailableError(),
    );

    await expect(
      controller.requestPasswordRecovery(PUBLIC_REQUEST, {
        email: 'enzo@example.com',
      }),
    ).resolves.toEqual({ accepted: true });
  });

  it('returns verification availability without echoing the token', async () => {
    inspectEmailVerification.mockResolvedValue(true);

    await expect(
      controller.inspectEmailVerification(PUBLIC_REQUEST, {
        token: 'v'.repeat(43),
      }),
    ).resolves.toEqual({
      verification: {
        available: true,
      },
    });
  });

  it('returns an unavailable verification as 410', async () => {
    inspectEmailVerification.mockResolvedValue(false);

    const error = await rejectedHttpException(
      controller.inspectEmailVerification(PUBLIC_REQUEST, {
        token: 'v'.repeat(43),
      }),
    );

    expect(error.getStatus()).toBe(410);
    expect(error.getResponse()).toEqual({
      code: 'VERIFICATION_NOT_AVAILABLE',
      message: 'Action link is not available',
    });
  });

  it('puts the Web bearer only in the HttpOnly cookie contract', async () => {
    login.mockResolvedValue({
      kind: 'authenticated',
      user: USER,
      sessionToken: 'a'.repeat(43),
      session: SESSION,
    });
    const setCookie = jest.fn<void, [string, string, SessionCookieOptions]>();
    const reply = {
      setCookie,
    } as unknown as FastifyReply;

    await expect(
      controller.login(
        PUBLIC_REQUEST,
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
    login.mockResolvedValue({
      kind: 'authenticated',
      user: USER,
      sessionToken: 'b'.repeat(43),
      session: mobileSession,
    });

    await expect(
      controller.mobileLogin(PUBLIC_REQUEST, {
        email: 'enzo@example.com',
        password: 'correct-horse-battery',
      }),
    ).resolves.toEqual({
      user: USER,
      sessionToken: 'b'.repeat(43),
      session: mobileSession,
    });
  });

  it('rejects invalid credentials without setting a Web cookie', async () => {
    login.mockResolvedValue({ kind: 'invalid_credentials' });
    const setCookie = jest.fn<void, [string, string, SessionCookieOptions]>();
    const reply = {
      setCookie,
    } as unknown as FastifyReply;

    const error = await rejectedHttpException(
      controller.login(
        PUBLIC_REQUEST,
        {
          email: 'missing@example.com',
          password: 'incorrect-password',
        },
        reply,
      ),
    );

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials',
    });
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('returns verification-required only after credential proof', async () => {
    login.mockResolvedValue({ kind: 'email_verification_required' });
    const setCookie = jest.fn<void, [string, string, SessionCookieOptions]>();
    const reply = {
      setCookie,
    } as unknown as FastifyReply;

    const error = await rejectedHttpException(
      controller.login(
        PUBLIC_REQUEST,
        {
          email: 'enzo@example.com',
          password: 'correct-horse-battery',
        },
        reply,
      ),
    );

    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toEqual({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      message: 'Email verification required',
    });
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
