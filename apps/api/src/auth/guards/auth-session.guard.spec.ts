import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

import type { UserDocument } from '../../users/schemas/user.schema';
import type { UsersService } from '../../users/users.service';
import type { AuthSessionService } from '../session/auth-session.service';
import { AuthSessionGuard } from './auth-session.guard';

const TOKEN = 'a'.repeat(43);

function contextFor(request: Partial<FastifyRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function user(
  credentialVersion: number,
  accountStatus: 'active' | 'restricted' | undefined = undefined,
): UserDocument {
  return {
    _id: {
      toString: () => 'user-1',
    },
    email: 'enzo@example.com',
    credential_version: credentialVersion,
    account_status: accountStatus,
  } as unknown as UserDocument;
}

describe('AuthSessionGuard credential fencing', () => {
  const resolve = jest.fn();
  const revokeCurrent = jest.fn();
  const findById = jest.fn();

  const sessions = {
    resolve,
    revokeCurrent,
  } as unknown as AuthSessionService;

  const users = {
    findById,
  } as unknown as UsersService;

  const config = new ConfigService({
    NODE_ENV: 'development',
  });

  const guard = new AuthSessionGuard(sessions, users, config);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a session created under the current credential version', async () => {
    resolve.mockResolvedValue({
      userId: 'user-1',
      credentialVersion: 2,
      session: {
        id: '93b0d36e-a992-487f-b9ba-1173c47800f7',
        clientType: 'web',
        createdAt: '2026-09-22T14:00:00.000Z',
        lastSeenAt: '2026-09-22T14:00:00.000Z',
        expiresAt: '2026-10-22T14:00:00.000Z',
        current: true,
      },
    });
    findById.mockResolvedValue(user(2));

    const request = {
      headers: {},
      cookies: {
        losapuntes_session: TOKEN,
      },
    } as unknown as FastifyRequest;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(revokeCurrent).not.toHaveBeenCalled();
  });

  it('fails closed with ACCOUNT_RESTRICTED and revokes an existing session', async () => {
    resolve.mockResolvedValue({
      userId: 'user-1',
      credentialVersion: 2,
      session: {
        id: '93b0d36e-a992-487f-b9ba-1173c47800f7',
        clientType: 'mobile',
        createdAt: '2026-09-22T14:00:00.000Z',
        lastSeenAt: '2026-09-22T14:00:00.000Z',
        expiresAt: '2026-10-22T14:00:00.000Z',
        current: true,
      },
    });
    findById.mockResolvedValue(user(2, 'restricted'));

    const request = {
      headers: {
        authorization: `Bearer ${TOKEN}`,
      },
      cookies: {},
    } as unknown as FastifyRequest;

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 403,
      response: {
        code: 'ACCOUNT_RESTRICTED',
      },
    });
    expect(revokeCurrent).toHaveBeenCalledWith(TOKEN);
  });

  it('fails closed and revokes a session fenced by a newer credential version', async () => {
    resolve.mockResolvedValue({
      userId: 'user-1',
      credentialVersion: 1,
      session: {
        id: '93b0d36e-a992-487f-b9ba-1173c47800f7',
        clientType: 'web',
        createdAt: '2026-09-22T14:00:00.000Z',
        lastSeenAt: '2026-09-22T14:00:00.000Z',
        expiresAt: '2026-10-22T14:00:00.000Z',
        current: true,
      },
    });
    findById.mockResolvedValue(user(2));

    const request = {
      headers: {},
      cookies: {
        losapuntes_session: TOKEN,
      },
    } as unknown as FastifyRequest;

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 401,
    });
    expect(revokeCurrent).toHaveBeenCalledWith(TOKEN);
  });
  it('rejects a request with no supported session credential', async () => {
    const request = {
      headers: {},
      cookies: {},
    } as unknown as FastifyRequest;

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 401,
      response: {
        code: 'AUTHENTICATION_REQUIRED',
      },
    });

    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects a credential that no longer resolves to an active session', async () => {
    resolve.mockResolvedValue(null);
    const request = {
      headers: {},
      cookies: {
        losapuntes_session: TOKEN,
      },
    } as unknown as FastifyRequest;

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 401,
    });

    expect(findById).not.toHaveBeenCalled();
  });

  it('revokes a session whose account disappeared', async () => {
    resolve.mockResolvedValue({
      userId: 'deleted-user',
      credentialVersion: 1,
      session: {
        id: '93b0d36e-a992-487f-b9ba-1173c47800f7',
        clientType: 'web',
        createdAt: '2026-09-22T14:00:00.000Z',
        lastSeenAt: '2026-09-22T14:00:00.000Z',
        expiresAt: '2026-10-22T14:00:00.000Z',
        current: true,
      },
    });
    findById.mockResolvedValue(null);
    const request = {
      headers: {},
      cookies: {
        losapuntes_session: TOKEN,
      },
    } as unknown as FastifyRequest;

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 401,
    });

    expect(revokeCurrent).toHaveBeenCalledWith(TOKEN);
  });

});
