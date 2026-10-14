import type { SavedResourceCursor } from './resource.store';
import type { SavedTitleCursor } from './resource-saved-title-cursor';

export const SAVED_RESOURCE_SEARCH_STORE = Symbol(
  'SAVED_RESOURCE_SEARCH_STORE',
);

export type SavedLibraryOrder = 'saved' | 'title';
export interface SavedSearchPage {
  items: Array<{ resourceId: string; createdAt: Date; title?: string }>;
  hasMore: boolean;
}

/** Query-only port kept separate from export and ordinary saved-list APIs. */
export interface SavedResourceSearchStore {
  searchSavedResources(input: {
    userId: string;
    q?: string;
    subjectId?: string;
    limit: number;
    order?: SavedLibraryOrder;
    after?: SavedResourceCursor;
    titleAfter?: SavedTitleCursor;
  }): Promise<SavedSearchPage>;
  /**
   * True only if the last emitted page anchor still belongs to the actor,
   * matches the original filters and remains currently readable.
   * The title position uses the same Mongo collation as keyset paging.
   */
  isSavedSearchAnchorCurrent(input: {
    userId: string;
    q?: string;
    subjectId?: string;
    after?: SavedResourceCursor;
    titleAfter?: SavedTitleCursor;
  }): Promise<boolean>;
  listSavedSubjectFacets(userId: string): Promise<{
    items: Array<{ subjectId: string; count: number }>;
    truncated: boolean;
  }>;
}
