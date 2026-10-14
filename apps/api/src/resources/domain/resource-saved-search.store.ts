import type { SavedResourceCursor } from './resource.store';
import type { SavedTitleCursor } from './resource-saved-title-cursor';

export const SAVED_RESOURCE_SEARCH_STORE = Symbol('SAVED_RESOURCE_SEARCH_STORE');

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
  listSavedSubjectFacets(userId: string): Promise<{
    items: Array<{ subjectId: string; count: number }>;
    truncated: boolean;
  }>;
}
