import { UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export interface ReceivedRepliesCursor {
  createdAt: Date;
  id: string;
}

const ANSWER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function isReceivedReplyAnswerId(value: unknown): value is string {
  return typeof value === 'string' && ANSWER_ID.test(value);
}
const ENCODED_CURSOR = /^[A-Za-z0-9_-]{1,512}$/u;

function rejectCursor(): never {
  throw new UnprocessableEntityException({
    code: 'QA_RECEIVED_REPLIES_CURSOR_INVALID',
    message: 'Received replies cursor is invalid',
  });
}

function ownerTag(ownerUserId: string): string {
  return createHash('sha256')
    .update(ownerUserId, 'utf8')
    .digest('hex')
    .slice(0, 24);
}

export function encodeReceivedRepliesCursor(
  cursor: ReceivedRepliesCursor,
  ownerUserId: string,
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      t: cursor.createdAt.toISOString(),
      id: cursor.id,
      owner: ownerTag(ownerUserId),
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeReceivedRepliesCursor(
  value: unknown,
  ownerUserId: string,
): ReceivedRepliesCursor | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !ENCODED_CURSOR.test(value)) {
    rejectCursor();
  }

  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value || bytes.length > 384) {
      rejectCursor();
    }
    const data: unknown = JSON.parse(bytes.toString('utf8'));
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      rejectCursor();
    }
    const fields = data as Record<string, unknown>;
    if (
      Object.keys(fields).length !== 4 ||
      fields.v !== 1 ||
      typeof fields.t !== 'string' ||
      typeof fields.id !== 'string' ||
      !isReceivedReplyAnswerId(fields.id) ||
      fields.owner !== ownerTag(ownerUserId)
    ) {
      rejectCursor();
    }
    const createdAt = new Date(fields.t);
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== fields.t
    ) {
      rejectCursor();
    }
    return { createdAt, id: fields.id };
  } catch {
    rejectCursor();
  }
}
