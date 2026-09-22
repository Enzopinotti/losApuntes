import {
  createSessionToken,
  hashSessionToken,
  isSessionToken,
} from './session-token';

describe('session token', () => {
  it('creates opaque 32-byte base64url bearer values', () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).toHaveLength(43);
    expect(isSessionToken(first)).toBe(true);
    expect(isSessionToken(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('rejects malformed bearer values', () => {
    expect(isSessionToken('')).toBe(false);
    expect(isSessionToken('not-a-session')).toBe(false);
    expect(isSessionToken('a'.repeat(42))).toBe(false);
    expect(isSessionToken(`${'a'.repeat(42)}!`)).toBe(false);
  });

  it('hashes a bearer without preserving the raw value', () => {
    const token = createSessionToken();
    const digest = hashSessionToken(token);

    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(digest).not.toContain(token);
    expect(hashSessionToken(token)).toBe(digest);
  });
});
