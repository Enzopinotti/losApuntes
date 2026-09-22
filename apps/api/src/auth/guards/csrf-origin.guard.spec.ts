import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

import { CsrfOriginGuard } from './csrf-origin.guard';

function contextFor(request: Partial<FastifyRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('CsrfOriginGuard', () => {
  const guard = new CsrfOriginGuard(
    new ConfigService({
      NODE_ENV: 'development',
      WEB_ORIGIN: 'http://localhost:5173',
    }),
  );

  it('does not require Origin for safe methods', () => {
    expect(
      guard.canActivate(
        contextFor({
          method: 'GET',
          headers: {},
          cookies: { losapuntes_session: 'a'.repeat(43) },
        }),
      ),
    ).toBe(true);
  });

  it('does not apply browser CSRF checks to bearer-only unsafe requests', () => {
    expect(
      guard.canActivate(
        contextFor({
          method: 'POST',
          headers: {
            authorization: `Bearer ${'a'.repeat(43)}`,
          },
          cookies: {},
        }),
      ),
    ).toBe(true);
  });

  it('accepts the exact configured Origin for unsafe cookie requests', () => {
    expect(
      guard.canActivate(
        contextFor({
          method: 'DELETE',
          headers: {
            origin: 'http://localhost:5173',
          },
          cookies: { losapuntes_session: 'a'.repeat(43) },
        }),
      ),
    ).toBe(true);
  });

  it('rejects a cross-site Fetch Metadata request even if Origin is forged', () => {
    expect(() =>
      guard.canActivate(
        contextFor({
          method: 'POST',
          headers: {
            origin: 'http://localhost:5173',
            'sec-fetch-site': 'cross-site',
          },
          cookies: { losapuntes_session: 'a'.repeat(43) },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('accepts same-origin Fetch Metadata with the exact configured Origin', () => {
    expect(
      guard.canActivate(
        contextFor({
          method: 'POST',
          headers: {
            origin: 'http://localhost:5173',
            'sec-fetch-site': 'same-origin',
          },
          cookies: { losapuntes_session: 'a'.repeat(43) },
        }),
      ),
    ).toBe(true);
  });

  it('rejects an untrusted Origin for unsafe cookie requests', () => {
    expect(() =>
      guard.canActivate(
        contextFor({
          method: 'DELETE',
          headers: {
            origin: 'https://evil.example',
          },
          cookies: { losapuntes_session: 'a'.repeat(43) },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
