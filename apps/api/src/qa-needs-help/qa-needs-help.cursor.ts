import { UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export interface QaNeedsHelpCursor {
  createdAt: Date;
  questionId: string;
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TOKEN = /^[A-Za-z0-9_-]{1,512}$/u;

function invalidCursor(): never {
  throw new UnprocessableEntityException({
    code: 'QA_NEEDS_HELP_CURSOR_INVALID',
    message: 'Needs-help cursor is invalid',
  });
}

function fingerprint(userId: string): string {
  return createHash('sha256').update(userId, 'utf8').digest('hex').slice(0, 24);
}

export function encodeNeedsHelpCursor(
  value: QaNeedsHelpCursor,
  subjectId: string,
  viewerId: string,
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      subjectId,
      viewer: fingerprint(viewerId),
      createdAt: value.createdAt.toISOString(),
      questionId: value.questionId,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeNeedsHelpCursor(
  raw: unknown,
  subjectId: string,
  viewerId: string,
): QaNeedsHelpCursor | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !TOKEN.test(raw)) invalidCursor();

  try {
    const bytes = Buffer.from(raw, 'base64url');
    if (bytes.length > 384 || bytes.toString('base64url') !== raw) {
      invalidCursor();
    }
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      invalidCursor();
    }
    const value = parsed as Record<string, unknown>;
    if (
      Object.keys(value).length !== 5 ||
      value.v !== 1 ||
      value.subjectId !== subjectId ||
      value.viewer !== fingerprint(viewerId) ||
      typeof value.questionId !== 'string' ||
      !UUID_V4.test(value.questionId) ||
      typeof value.createdAt !== 'string'
    ) {
      invalidCursor();
    }
    const createdAt = new Date(value.createdAt);
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== value.createdAt
    ) {
      invalidCursor();
    }
    return { createdAt, questionId: value.questionId };
  } catch {
    invalidCursor();
  }
}
