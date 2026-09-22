import type { FastifyRequest } from 'fastify';

import { presentedSessionCredential } from './session-credential';

const COOKIE_NAME = 'losapuntes_session';
const TOKEN = 'a'.repeat(43);
const OTHER_TOKEN = 'b'.repeat(43);

function request(
  authorization?: string,
  cookies: Record<string, string> = {},
): FastifyRequest {
  return {
    headers: {
      authorization,
    },
    cookies,
  } as unknown as FastifyRequest;
}

describe('presentedSessionCredential', () => {
  it('accepts one valid web cookie', () => {
    expect(
      presentedSessionCredential(request(undefined, { [COOKIE_NAME]: TOKEN }), COOKIE_NAME),
    ).toEqual({
      sessionToken: TOKEN,
      clientType: 'web',
    });
  });

  it('accepts one valid mobile bearer', () => {
    expect(
      presentedSessionCredential(request(`Bearer ${TOKEN}`), COOKIE_NAME),
    ).toEqual({
      sessionToken: TOKEN,
      clientType: 'mobile',
    });
  });

  it('fails closed when cookie and Authorization are both presented', () => {
    expect(
      presentedSessionCredential(
        request(`Bearer ${OTHER_TOKEN}`, { [COOKIE_NAME]: TOKEN }),
        COOKIE_NAME,
      ),
    ).toBeNull();
  });

  it.each([
    'bearer token',
    'Bearer short',
    `Basic ${TOKEN}`,
    `Bearer ${TOKEN} extra`,
  ])('rejects malformed Authorization: %s', (authorization) => {
    expect(
      presentedSessionCredential(request(authorization), COOKIE_NAME),
    ).toBeNull();
  });

  it('rejects a malformed cookie token', () => {
    expect(
      presentedSessionCredential(
        request(undefined, { [COOKIE_NAME]: 'not-a-session' }),
        COOKIE_NAME,
      ),
    ).toBeNull();
  });
});
