export const STUDY_COLLECTION_STORE = Symbol('STUDY_COLLECTION_STORE');

export const STUDY_COLLECTION_MAX_ITEMS = 100;
export const STUDY_COLLECTION_MAX_PAGE = 25;

export interface StudyCollectionRecord {
  id: string;
  ownerUserId: string;
  operationKey: string;
  title: string;
  description: string | null;
  resourceIds: string[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudyCollectionCursor {
  createdAt: Date;
  id: string;
}

export interface StudyCollectionStore {
  create(input: {
    id: string;
    ownerUserId: string;
    operationKey: string;
    title: string;
    description: string | null;
  }): Promise<StudyCollectionRecord>;
  list(input: {
    ownerUserId: string;
    limit: number;
    after?: StudyCollectionCursor;
  }): Promise<{ items: StudyCollectionRecord[]; hasMore: boolean }>;
  findOwned(
    id: string,
    ownerUserId: string,
  ): Promise<StudyCollectionRecord | null>;
  updateOwned(input: {
    id: string;
    ownerUserId: string;
    expectedRevision: number;
    patch: { title?: string; description?: string | null };
  }): Promise<StudyCollectionRecord | null>;
  addResource(
    id: string,
    ownerUserId: string,
    resourceId: string,
  ): Promise<StudyCollectionRecord | null>;
  removeResource(
    id: string,
    ownerUserId: string,
    resourceId: string,
    expectedRevision?: number,
  ): Promise<StudyCollectionRecord | null>;
  /**
   * Atomically replace only the order (not membership) under the existing
   * active-owner lifecycle transaction. Both revision and original array are
   * CAS predicates, so concurrent adds, removals or reorders cannot be lost.
   */
  reorderResources(input: {
    id: string;
    ownerUserId: string;
    expectedRevision: number;
    originalResourceIds: string[];
    orderedResourceIds: string[];
  }): Promise<StudyCollectionRecord | null>;
  deleteOwned(id: string, ownerUserId: string): Promise<boolean>;
}
