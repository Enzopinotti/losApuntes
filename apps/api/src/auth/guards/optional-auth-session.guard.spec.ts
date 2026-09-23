import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

import { AuthSessionGuard } from './auth-session.guard';
import { OptionalAuthSessionGuard } from './optional-auth-session.guard';

function contextFor(request: Partial<FastifyRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('OptionalAuthSessionGuard', () => {
  const canActivateRequired = jest.fn();
  const required = {
    canActivate: canActivateRequired,
  } as unknown as AuthSessionGuard;
  const config = new ConfigService({ NODE_ENV: 'development' });
  const guard = new OptionalAuthSessionGuard(required, config);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows a request only when no supported credential was presented', async () => {
    const request = {
      headers: {},
      cookies: {},
    } as unknown as FastifyRequest;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(canActivateRequired).not.toHaveBeenCalled();
  });

  it('delegates any Authorization header to the required guard', async () => {
    canActivateRequired.mockRejectedValue(
      Object.assign(new Error('unauthorized'), { status: 401 }),
    );
    const request = {
      headers: { authorization: 'Bearer malformed' },
      cookies: {},
    } as unknown as FastifyRequest;

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 401,
    });
    expect(canActivateRequired.mock.calls).toHaveLength(1);
  });

  it('delegates any session cookie value to the required guard', async () => {
    canActivateRequired.mockResolvedValue(true);
    const request = {
      headers: {},
      cookies: { losapuntes_session: 'malformed' },
    } as unknown as FastifyRequest;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(canActivateRequired.mock.calls).toHaveLength(1);
  });

  it('delegates ambiguous cookie plus Authorization credentials', async () => {
    canActivateRequired.mockRejectedValue(
      Object.assign(new Error('unauthorized'), { status: 401 }),
    );
    const request = {
      headers: { authorization: 'Bearer malformed' },
      cookies: { losapuntes_session: 'malformed' },
    } as unknown as FastifyRequest;

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 401,
    });
    expect(canActivateRequired.mock.calls).toHaveLength(1);
  });
});
