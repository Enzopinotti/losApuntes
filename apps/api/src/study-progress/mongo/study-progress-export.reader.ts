import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  parseStudyProgressPlan,
  type StudyProgressPlan,
} from '../domain/study-progress.plan';
import { StudyProgress } from './study-progress.schema';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const STUDY_PROGRESS_EXPORT_PAGE_LIMIT = 100;

export type StudyProgressExportRow = {
  subjectId: string;
  plan: StudyProgressPlan;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

function invalidCursor(): never {
  throw new UnprocessableEntityException({
    code: 'STUDY_PROGRESS_EXPORT_CURSOR_INVALID',
    message: 'Study progress export cursor is invalid',
  });
}

function parseCursor(
  cursor: string | null,
  ownerUserId: string,
): string | null {
  if (cursor === null) return null;
  if (
    typeof cursor !== 'string' ||
    cursor.length > 512 ||
    cursor.length === 0 ||
    !/^[A-Za-z0-9_-]+$/u.test(cursor)
  )
    return invalidCursor();
  try {
    const buffer = Buffer.from(cursor, 'base64url');
    if (buffer.length > 256 || buffer.toString('base64url') !== cursor) {
      return invalidCursor();
    }
    const data: unknown = JSON.parse(buffer.toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return invalidCursor();
    }
    const row = data as Record<string, unknown>;
    if (
      Object.keys(row).sort().join(',') !==
        'afterSubjectId,ownerUserId,version' ||
      row.version !== 1 ||
      row.ownerUserId !== ownerUserId ||
      typeof row.afterSubjectId !== 'string' ||
      !UUID.test(row.afterSubjectId)
    ) {
      return invalidCursor();
    }
    return row.afterSubjectId;
  } catch {
    return invalidCursor();
  }
}

function nextCursor(ownerUserId: string, afterSubjectId: string): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      ownerUserId,
      afterSubjectId,
    }),
    'utf8',
  ).toString('base64url');
}

type Stored = {
  subjectId: string;
  plan: unknown;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

function project(row: Stored): StudyProgressExportRow {
  if (
    !UUID.test(row.subjectId) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    !(row.createdAt instanceof Date) ||
    !Number.isFinite(row.createdAt.getTime()) ||
    !(row.updatedAt instanceof Date) ||
    !Number.isFinite(row.updatedAt.getTime())
  ) {
    throw new Error('Study progress export row is invalid');
  }
  // Do not trust legacy Mongo records. Invalid records fail the entire
  // export rather than silently omitting private data.
  const plan = parseStudyProgressPlan(row.plan, row.subjectId);
  return {
    subjectId: row.subjectId,
    plan,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Read-only owner projection. Cursor is owner-bound and ordered by immutable
 * subjectId with the existing unique {ownerUserId,subjectId} index.
 * No source credentials, file URLs, third-party labels or owner ID in rows.
 */
@Injectable()
export class StudyProgressExportReader {
  constructor(
    @InjectModel(StudyProgress.name)
    private readonly progress: Model<StudyProgress>,
  ) {}

  async hasOwnedProgress(ownerUserId: string): Promise<boolean> {
    if (typeof ownerUserId !== 'string' || !ownerUserId.trim()) {
      throw new Error('Export owner required');
    }
    const result = await this.progress.exists({ ownerUserId }).exec();
    return result !== null;
  }

  async listAccountExportProgress(
    ownerUserId: string,
    input: { cursor: string | null; limit: number },
  ): Promise<{ items: StudyProgressExportRow[]; nextCursor: string | null }> {
    if (typeof ownerUserId !== 'string' || !ownerUserId.trim()) {
      throw new Error('Export owner required');
    }
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > STUDY_PROGRESS_EXPORT_PAGE_LIMIT
    ) {
      throw new Error('Study progress export page budget invalid');
    }
    const afterSubjectId = parseCursor(input.cursor, ownerUserId);
    const rows = await this.progress
      .find({
        ownerUserId,
        ...(afterSubjectId ? { subjectId: { $gt: afterSubjectId } } : {}),
      })
      .select({
        _id: 0,
        subjectId: 1,
        plan: 1,
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ subjectId: 1 })
      .limit(input.limit + 1)
      .lean<Stored[]>()
      .exec();
    const page = rows.slice(0, input.limit);
    return {
      items: page.map(project),
      nextCursor:
        rows.length > input.limit && page.length > 0
          ? nextCursor(ownerUserId, page[page.length - 1].subjectId)
          : null,
    };
  }
}
