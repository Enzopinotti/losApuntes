import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  STUDY_COLLECTION_MAX_ITEMS,
  STUDY_COLLECTION_STORE,
  type StudyCollectionRecord,
  type StudyCollectionStore,
} from './study-collection.store';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function invalidInput(): never {
  throw new UnprocessableEntityException({
    code: 'STUDY_COLLECTION_ORDER_INVALID',
    message:
      'Resource order must contain unique valid identifiers, at most 100',
  });
}

function conflict(): never {
  throw new ConflictException({
    code: 'STUDY_COLLECTION_ORDER_CONFLICT',
    message: 'Collection membership or revision changed; reload and retry',
  });
}

function corrupt(): never {
  throw new ServiceUnavailableException({
    code: 'STUDY_COLLECTION_ORDER_DATA_INVALID',
    message: 'Collection order could not be changed safely',
  });
}

function projection(row: StudyCollectionRecord) {
  return {
    id: row.id,
    revision: row.revision,
    resourceCount: row.resourceIds.length,
    resourceIds: [...row.resourceIds],
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validStored(row: StudyCollectionRecord, id: string, owner: string) {
  return (
    row.id === id &&
    row.ownerUserId === owner &&
    Number.isSafeInteger(row.revision) &&
    row.revision >= 1 &&
    Array.isArray(row.resourceIds) &&
    row.resourceIds.length <= STUDY_COLLECTION_MAX_ITEMS &&
    row.resourceIds.every(
      (ref) => typeof ref === 'string' && UUID_V4.test(ref),
    ) &&
    new Set(row.resourceIds.map((ref) => ref.toLowerCase())).size ===
      row.resourceIds.length &&
    row.updatedAt instanceof Date &&
    Number.isFinite(row.updatedAt.getTime())
  );
}

/**
 * Reorders existing references, never adds, removes or resolves resources.
 * The existing Store transaction serializes mutations against account closure.
 */
@Injectable()
export class StudyCollectionOrderService {
  constructor(
    @Inject(STUDY_COLLECTION_STORE)
    private readonly store: StudyCollectionStore,
  ) {}

  async reorder(
    ownerUserId: string,
    collectionId: string,
    input: { expectedRevision: number; resourceIds: string[] },
  ) {
    if (!ownerUserId || !ownerUserId.trim() || !UUID_V4.test(collectionId)) {
      return invalidInput();
    }
    if (
      !input ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1 ||
      !Array.isArray(input.resourceIds) ||
      input.resourceIds.length > STUDY_COLLECTION_MAX_ITEMS ||
      !input.resourceIds.every(
        (id) => typeof id === 'string' && UUID_V4.test(id),
      ) ||
      new Set(input.resourceIds.map((id) => id.toLowerCase())).size !==
        input.resourceIds.length
    ) {
      return invalidInput();
    }

    const canonicalCollectionId = collectionId.toLowerCase();
    const orderedResourceIds = input.resourceIds.map((id) => id.toLowerCase());
    const current = await this.store.findOwned(
      canonicalCollectionId,
      ownerUserId,
    );
    if (!current) {
      throw new NotFoundException({
        code: 'STUDY_COLLECTION_NOT_FOUND',
        message: 'Study collection was not found',
      });
    }
    if (!validStored(current, canonicalCollectionId, ownerUserId))
      return corrupt();

    if (current.revision !== input.expectedRevision) return conflict();
    const currentResourceIds = current.resourceIds.map((id) =>
      id.toLowerCase(),
    );
    if (
      currentResourceIds.length !== orderedResourceIds.length ||
      orderedResourceIds.some((id) => !currentResourceIds.includes(id))
    ) {
      return conflict();
    }

    // A true no-op must not bump the revision or update timestamp. No
    // visibility is inferred from IDs: these are existing owned references.
    if (
      currentResourceIds.every((id, index) => id === orderedResourceIds[index])
    ) {
      return { collection: projection(current), changed: false };
    }

    const updated = await this.store.reorderResources({
      id: canonicalCollectionId,
      ownerUserId,
      expectedRevision: input.expectedRevision,
      originalResourceIds: [...current.resourceIds],
      orderedResourceIds: [...orderedResourceIds],
    });

    if (!updated) return conflict();
    if (
      !validStored(updated, canonicalCollectionId, ownerUserId) ||
      updated.revision !== input.expectedRevision + 1 ||
      updated.resourceIds.length !== orderedResourceIds.length ||
      updated.resourceIds.some((id, index) => id !== orderedResourceIds[index])
    ) {
      return corrupt();
    }
    return { collection: projection(updated), changed: true };
  }
}
