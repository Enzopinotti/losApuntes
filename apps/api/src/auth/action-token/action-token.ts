import { createHash, randomBytes, randomUUID } from 'node:crypto';

const ACTION_TOKEN_BYTES = 32;
export const ACTION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function createActionToken(): string {
  return randomBytes(ACTION_TOKEN_BYTES).toString('base64url');
}

export function isActionToken(value: string): boolean {
  return ACTION_TOKEN_PATTERN.test(value);
}

export function hashActionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createActionTokenId(): string {
  return randomUUID();
}
