import { createHash, randomBytes, randomUUID } from 'node:crypto';

const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function isSessionToken(value: string): boolean {
  return SESSION_TOKEN_PATTERN.test(value);
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createSessionId(): string {
  return randomUUID();
}

export function isSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value);
}
