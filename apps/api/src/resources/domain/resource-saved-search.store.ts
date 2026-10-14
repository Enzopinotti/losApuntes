import type {
  SavedResourceCursor,
  SavedResourcePage,
} from './resource.store';

export const SAVED_RESOURCE_SEARCH_STORE = Symbol('SAVED_RESOURCE_SEARCH_STORE');

/** Query-only port kept separate from export and ordinary saved-list APIs. */
export interface SavedResourceSearchStore {
  searchSavedResources(input: {
    userId: string;
    q?: string;
    subjectId?: string;
    limit: number;
    after?: SavedResourceCursor;
  }): Promise<SavedResourcePage>;
  listSavedSubjectFacets(userId: string): Promise<{
    items: Array<{ subjectId: string; count: number }>;
    truncated: boolean;
  }>;
}
