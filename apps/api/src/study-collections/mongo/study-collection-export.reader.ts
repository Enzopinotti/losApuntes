import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { StudyCollection } from './study-collection.mongo-schema';

export const STUDY_COLLECTION_EXPORT_PAGE_LIMIT = 100;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type StudyCollectionExportRow = {
  id: string;
  title: string;
  description: string | null;
  resourceIds: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
};
type DatabaseRow = {
  id: string;
  title: string;
  description: string | null;
  resourceIds: string[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

function invalidCursor(): never {
  throw new UnprocessableEntityException({
    code: 'STUDY_COLLECTION_EXPORT_CURSOR_INVALID',
    message: 'The study collection export cursor is invalid',
  });
}

function parseCursor(cursor: string | null, userId: string): string | null {
  if (cursor === null) return null;
  if (
    typeof cursor !== 'string' ||
    cursor.length < 1 ||
    cursor.length > 512 ||
    !/^[A-Za-z0-9_-]+$/u.test(cursor)
  )
    return invalidCursor();

  let value: unknown;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.length > 256 || bytes.toString('base64url') !== cursor)
      return invalidCursor();
    value = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    return invalidCursor();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalidCursor();
  }
  const parsed = value as Record<string, unknown>;
  if (
    Object.keys(parsed).sort().join(',') !== 'afterId,ownerUserId,version' ||
    parsed.version !== 1 ||
    parsed.ownerUserId !== userId ||
    typeof parsed.afterId !== 'string' ||
    !UUID_V4.test(parsed.afterId)
  )
    return invalidCursor();
  return parsed.afterId;
}

function nextCursor(userId: string, afterId: string): string {
  return Buffer.from(
    JSON.stringify({ version: 1, ownerUserId: userId, afterId }),
    'utf8',
  ).toString('base64url');
}

function project(row: DatabaseRow): StudyCollectionExportRow {
  if (
    !UUID_V4.test(row.id) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    typeof row.title !== 'string' ||
    row.title.trim().length < 1 ||
    row.title.length > 100 ||
    (typeof row.description !== 'string' && row.description !== null) ||
    (typeof row.description === 'string' && row.description.length > 500) ||
    !Array.isArray(row.resourceIds) ||
    row.resourceIds.length > 100 ||
    !row.resourceIds.every(
      (id) => typeof id === 'string' && UUID_V4.test(id),
    ) ||
    new Set(row.resourceIds).size !== row.resourceIds.length ||
    !(row.createdAt instanceof Date) ||
    !Number.isFinite(row.createdAt.getTime()) ||
    !(row.updatedAt instanceof Date) ||
    !Number.isFinite(row.updatedAt.getTime())
  ) {
    throw new Error('Study collection owner export row is invalid');
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    resourceIds: [...row.resourceIds],
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Domain-owned, read-only projection for Account Export v2.
 * Unlike the UI's createdAt-desc list, this view uses immutable id ASC
 * with a matching { ownerUserId: 1, id: 1 } index.
 * Never expands resource pointers or reads operationKey, _id or ownerUserId
 * into the portable artifact.
 */
@Injectable()
export class StudyCollectionExportReader {
  constructor(
    @InjectModel(StudyCollection.name)
    private readonly collections: Model<StudyCollection>,
  ) {}

  /**
   * Portability must outlive the feature rollout flag. A collection created
   * before a rollback still requires an account-export v2 artifact.
   *
   * Do not read collection bodies or perform an unrestricted count.
   * Database errors propagate so the caller never falls back to v1.
   */
  async hasOwnedCollections(ownerUserId: string): Promise<boolean> {
    if (typeof ownerUserId !== 'string' || ownerUserId.trim().length === 0) {
      throw new Error('Account export owner is required');
    }
    const found = await this.collections.exists({ ownerUserId }).exec();
    return found !== null;
  }

  async listAccountExportCollections(
    ownerUserId: string,
    input: { cursor: string | null; limit: number },
  ): Promise<{ items: StudyCollectionExportRow[]; nextCursor: string | null }> {
    if (typeof ownerUserId !== 'string' || ownerUserId.trim().length === 0) {
      throw new Error('Account export owner is required');
    }
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > STUDY_COLLECTION_EXPORT_PAGE_LIMIT
    ) {
      throw new Error('Study collection export page budget is invalid');
    }
    const afterId = parseCursor(input.cursor, ownerUserId);
    const documents = await this.collections
      .find({
        ownerUserId,
        ...(afterId ? { id: { $gt: afterId } } : {}),
      })
      .select({
        _id: 0,
        id: 1,
        title: 1,
        description: 1,
        resourceIds: 1,
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ id: 1 })
      .limit(input.limit + 1)
      .lean<DatabaseRow[]>()
      .exec();
    const page = documents.slice(0, input.limit);
    return {
      items: page.map(project),
      nextCursor:
        documents.length > input.limit && page.length > 0
          ? nextCursor(ownerUserId, page[page.length - 1].id)
          : null,
    };
  }
}
