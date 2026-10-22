import { UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export interface SolvedQaCursor {
  createdAt: Date;
  questionId: string;
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BASE64URL = /^[A-Za-z0-9_-]{1,512}$/u;

function invalid(): never {
  throw new UnprocessableEntityException({
    code: 'QA_SOLVED_LIBRARY_CURSOR_INVALID',
    message: 'Solved questions cursor is invalid',
  });
}

function viewerTag(viewerId: string): string {
  return createHash('sha256')
    .update(viewerId, 'utf8')
    .digest('hex')
    .slice(0, 24);
}

export function encodeSolvedQaCursor(
  cursor: SolvedQaCursor,
  subjectId: string,
  viewerId: string,
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      subject: subjectId,
      viewer: viewerTag(viewerId),
      at: cursor.createdAt.toISOString(),
      id: cursor.questionId,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeSolvedQaCursor(
  input: unknown,
  subjectId: string,
  viewerId: string,
): SolvedQaCursor | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== 'string' || !BASE64URL.test(input)) invalid();

  try {
    const bytes = Buffer.from(input, 'base64url');
    if (bytes.length > 384 || bytes.toString('base64url') !== input) invalid();

    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      invalid();
    }
    const fields = parsed as Record<string, unknown>;
    if (
      Object.keys(fields).length !== 5 ||
      fields.v !== 1 ||
      fields.subject !== subjectId ||
      fields.viewer !== viewerTag(viewerId) ||
      typeof fields.id !== 'string' ||
      !UUID_V4.test(fields.id) ||
      typeof fields.at !== 'string'
    ) {
      invalid();
    }

    const createdAt = new Date(fields.at);
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== fields.at
    ) {
      invalid();
    }

    return { createdAt, questionId: fields.id };
  } catch {
    invalid();
  }
}
