import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ResourceService } from '../../resources/domain/resource.service';
import type {
  CreateStudyCollectionDto,
  UpdateStudyCollectionDto,
} from '../dto/study-collection.dto';
import {
  STUDY_COLLECTION_MAX_ITEMS,
  STUDY_COLLECTION_MAX_PAGE,
  STUDY_COLLECTION_STORE,
  type StudyCollectionCursor,
  type StudyCollectionRecord,
  type StudyCollectionStore,
} from './study-collection.store';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(input: string): string {
  return input.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function title(input: string): string {
  const normalized = cleanText(input);
  if (!normalized || normalized.length > 100) {
    throw new UnprocessableEntityException({
      code: 'STUDY_COLLECTION_TITLE_INVALID',
      message: 'Title must contain between 1 and 100 characters',
    });
  }
  return normalized;
}

function description(input?: string): string | null {
  if (input === undefined) return null;
  const normalized = cleanText(input);
  if (normalized.length > 500) {
    throw new UnprocessableEntityException({
      code: 'STUDY_COLLECTION_DESCRIPTION_INVALID',
      message: 'Description must contain at most 500 characters',
    });
  }
  return normalized || null;
}

function invalidCursor(): never {
  throw new UnprocessableEntityException({
    code: 'STUDY_COLLECTION_CURSOR_INVALID',
    message: 'Study collection cursor is invalid',
  });
}

function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function parseCursor(value?: string): Record<string, unknown> | null {
  if (value === undefined) return null;
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
      return invalidCursor();
    }
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length > 256 || bytes.toString('base64url') !== value) {
      return invalidCursor();
    }
    const decoded: unknown = JSON.parse(bytes.toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      return invalidCursor();
    }
    return decoded as Record<string, unknown>;
  } catch {
    return invalidCursor();
  }
}

function listCursor(
  value: string | undefined,
  ownerUserId: string,
): StudyCollectionCursor | undefined {
  const parsed = parseCursor(value);
  if (!parsed) return undefined;
  if (
    Object.keys(parsed).sort().join(',') !==
      'createdAt,id,ownerUserId,version' ||
    parsed.version !== 1 ||
    parsed.ownerUserId !== ownerUserId ||
    typeof parsed.createdAt !== 'string' ||
    typeof parsed.id !== 'string' ||
    !UUID_V4.test(parsed.id)
  ) {
    return invalidCursor();
  }
  const createdAt = new Date(parsed.createdAt);
  if (
    Number.isNaN(createdAt.getTime()) ||
    createdAt.toISOString() !== parsed.createdAt
  ) {
    return invalidCursor();
  }
  return { createdAt, id: parsed.id };
}

function itemsCursor(
  value: string | undefined,
  ownerUserId: string,
  collection: StudyCollectionRecord,
): number {
  const parsed = parseCursor(value);
  if (!parsed) return 0;
  if (
    Object.keys(parsed).sort().join(',') !==
      'collectionId,index,ownerUserId,revision,version' ||
    parsed.version !== 1 ||
    parsed.ownerUserId !== ownerUserId ||
    parsed.collectionId !== collection.id ||
    !Number.isSafeInteger(parsed.index) ||
    (parsed.index as number) < 0 ||
    !Number.isSafeInteger(parsed.revision) ||
    (parsed.revision as number) < 1
  ) {
    return invalidCursor();
  }
  // A valid cursor bound to the current owner/collection identifies a
  // previous revision. Detect it before checking its old index against the
  // new array length: removing items must produce STALE (409), not 422.
  if (parsed.revision !== collection.revision) {
    throw new ConflictException({
      code: 'STUDY_COLLECTION_CURSOR_STALE',
      message: 'Study collection changed; reload from the first page',
    });
  }
  if ((parsed.index as number) >= collection.resourceIds.length) {
    return invalidCursor();
  }
  return parsed.index as number;
}

function projection(row: StudyCollectionRecord) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    resourceCount: row.resourceIds.length,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class StudyCollectionService {
  constructor(
    @Inject(STUDY_COLLECTION_STORE)
    private readonly store: StudyCollectionStore,
    private readonly resources: ResourceService,
  ) {}

  async create(ownerUserId: string, dto: CreateStudyCollectionDto) {
    const normalizedTitle = title(dto.title);
    const normalizedDescription = description(dto.description);
    const row = await this.store.create({
      id: randomUUID(),
      ownerUserId,
      operationKey: dto.operationKey,
      title: normalizedTitle,
      description: normalizedDescription,
    });

    if (
      row.title !== normalizedTitle ||
      row.description !== normalizedDescription
    ) {
      throw new ConflictException({
        code: 'STUDY_COLLECTION_OPERATION_KEY_CONFLICT',
        message: 'Operation key was already used for different content',
      });
    }
    return { collection: projection(row) };
  }

  async list(ownerUserId: string, limit: number, cursor?: string) {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > STUDY_COLLECTION_MAX_PAGE
    ) {
      return invalidCursor();
    }
    const after = listCursor(cursor, ownerUserId);
    const result = await this.store.list({
      ownerUserId,
      limit,
      ...(after ? { after } : {}),
    });
    const last = result.items.at(-1);
    return {
      items: result.items.map(projection),
      nextCursor:
        result.hasMore && last
          ? encodeCursor({
              version: 1,
              ownerUserId,
              createdAt: last.createdAt.toISOString(),
              id: last.id,
            })
          : null,
    };
  }

  async get(ownerUserId: string, id: string) {
    return { collection: projection(await this.requireOwned(id, ownerUserId)) };
  }

  async update(ownerUserId: string, id: string, dto: UpdateStudyCollectionDto) {
    if (dto.title === undefined && dto.description === undefined) {
      throw new UnprocessableEntityException({
        code: 'STUDY_COLLECTION_UPDATE_EMPTY',
        message: 'At least one field is required',
      });
    }
    const patch = {
      ...(dto.title !== undefined ? { title: title(dto.title) } : {}),
      ...(dto.description !== undefined
        ? { description: description(dto.description) }
        : {}),
    };
    const updated = await this.store.updateOwned({
      id,
      ownerUserId,
      expectedRevision: dto.expectedRevision,
      patch,
    });
    if (!updated) {
      await this.requireOwned(id, ownerUserId);
      throw new ConflictException({
        code: 'STUDY_COLLECTION_REVISION_CONFLICT',
        message: 'Collection changed concurrently; refresh and retry',
      });
    }
    return { collection: projection(updated) };
  }

  async delete(ownerUserId: string, id: string): Promise<void> {
    if (!(await this.store.deleteOwned(id, ownerUserId))) this.notFound();
  }

  async addResource(ownerUserId: string, id: string, resourceId: string) {
    await this.requireOwned(id, ownerUserId);
    // References never grant access: the Resource authority decides at write time.
    await this.resources.get(resourceId, ownerUserId);
    const row = await this.store.addResource(id, ownerUserId, resourceId);
    if (!row) this.notFound();
    if (!row.resourceIds.includes(resourceId)) {
      if (row.resourceIds.length >= STUDY_COLLECTION_MAX_ITEMS) {
        throw new ConflictException({
          code: 'STUDY_COLLECTION_FULL',
          message: 'Study collection has reached the 100 resource limit',
        });
      }
      throw new ConflictException({
        code: 'STUDY_COLLECTION_ADD_CONFLICT',
        message: 'Could not add the resource',
      });
    }
    return { collection: projection(row) };
  }

  async removeResource(
    ownerUserId: string,
    id: string,
    resourceId: string,
    expectedRevision?: number,
  ) {
    if (expectedRevision !== undefined) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        throw new UnprocessableEntityException({
          code: 'STUDY_COLLECTION_REVISION_INVALID',
          message: 'Expected revision must be a positive safe integer',
        });
      }
      // Conditional clean-up must verify ownership before looking at a
      // referenced Resource. A successful Resource GET vetoes removal.
      const current = await this.requireOwned(id, ownerUserId);
      if (current.revision !== expectedRevision) {
        throw new ConflictException({
          code: 'STUDY_COLLECTION_REVISION_CONFLICT',
          message:
            'Collection changed; inspect it again before removing a link',
        });
      }
      if (!current.resourceIds.includes(resourceId)) {
        throw new ConflictException({
          code: 'STUDY_COLLECTION_REFERENCE_CHANGED',
          message:
            'Reference was already changed; inspect the collection again',
        });
      }
      try {
        await this.resources.get(resourceId, ownerUserId);
      } catch (error) {
        // Only confirmed authorization / not-found failures permit removing
        // a broken reference. Any other error (including network/5xx)
        // stops recovery rather than treating the Resource as absent.
        if (
          !(error instanceof NotFoundException) &&
          !(error instanceof ForbiddenException)
        )
          throw error;
        // The Mongo mutation below checks revision again atomically.
        const removed = await this.store.removeResource(
          id,
          ownerUserId,
          resourceId,
          expectedRevision,
        );
        if (!removed) this.notFound();
        // A confirmed recovery must actually unlink the inaccessible
        // Resource, not merely return an incremented collection revision.
        // An ambiguous store outcome must never be presented as success.
        if (
          removed.revision !== expectedRevision + 1 ||
          removed.resourceIds.includes(resourceId)
        ) {
          throw new ConflictException({
            code: 'STUDY_COLLECTION_REVISION_CONFLICT',
            message:
              'Collection changed; inspect it again before removing a link',
          });
        }
        return { collection: projection(removed) };
      }
      // The Resource regained visibility after the client scanned. Do not
      // delete it or disclose its content as part of this response.
      throw new ConflictException({
        code: 'STUDY_COLLECTION_REFERENCE_ACCESSIBLE',
        message: 'Reference is accessible; run the inspection again',
      });
    }
    // Ordinary user-initiated removal remains backward-compatible and is
    // allowed even if the original resource can no longer be accessed.
    const row = await this.store.removeResource(id, ownerUserId, resourceId);
    if (!row) this.notFound();
    return { collection: projection(row) };
  }

  async listResources(
    ownerUserId: string,
    id: string,
    limit: number,
    cursor?: string,
  ) {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > STUDY_COLLECTION_MAX_PAGE
    ) {
      throw new UnprocessableEntityException({
        code: 'STUDY_COLLECTION_PAGE_LIMIT_INVALID',
        message: 'Page limit must be between 1 and 25',
      });
    }
    const row = await this.requireOwned(id, ownerUserId);
    const start = itemsCursor(cursor, ownerUserId, row);
    const resourceIds = row.resourceIds.slice(start, start + limit);
    const items = await Promise.all(
      resourceIds.map(async (resourceId) => {
        try {
          const result = await this.resources.get(resourceId, ownerUserId);
          return { resourceId, resource: result.resource };
        } catch (error) {
          if (
            error instanceof NotFoundException ||
            error instanceof ForbiddenException
          ) {
            return { resourceId, resource: null };
          }
          throw error;
        }
      }),
    );
    const nextIndex = start + resourceIds.length;
    return {
      items,
      revision: row.revision,
      nextCursor:
        nextIndex < row.resourceIds.length
          ? encodeCursor({
              version: 1,
              ownerUserId,
              collectionId: id,
              revision: row.revision,
              index: nextIndex,
            })
          : null,
    };
  }

  private async requireOwned(id: string, ownerUserId: string) {
    const row = await this.store.findOwned(id, ownerUserId);
    if (!row) this.notFound();
    return row;
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'STUDY_COLLECTION_NOT_FOUND',
      message: 'Study collection was not found',
    });
  }
}
