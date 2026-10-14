import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  SAVED_RESOURCE_SEARCH_STORE,
  type SavedResourceSearchStore,
} from './resource-saved-search.store';
import { ResourceService } from './resource.service';
import {
  decodeSavedSearchCursor,
  encodeSavedSearchCursor,
} from './resource-saved-search-cursor';

function normalizeSavedQuery(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es-AR');
}

/**
 * Separately owned search orchestration to avoid changing account-export
 * contributors in ResourceService. ResourceService.get remains the single
 * authorization + public-projection authority for each returned resource.
 */
@Injectable()
export class ResourceSavedSearchService {
  constructor(
    @Inject(SAVED_RESOURCE_SEARCH_STORE)
    private readonly store: SavedResourceSearchStore,
    private readonly resources: ResourceService,
  ) {}

  async search(userId: string, rawQuery: string, limit: number, cursor?: string) {
    const q = normalizeSavedQuery(rawQuery);
    const after = decodeSavedSearchCursor(cursor, userId, q);
    const page = await this.store.searchSavedResources({
      userId,
      q,
      limit,
      ...(after ? { after } : {}),
    });

    // Availability can change between Mongo's snapshot and HTTP projection.
    // Keep a second fail-closed read on the existing resource authority.
    const projected = await Promise.all(
      page.items.map(async ({ resourceId }) => {
        try {
          const result = await this.resources.get(resourceId, userId);
          return result.resource;
        } catch (error) {
          if (error instanceof NotFoundException) return null;
          throw error;
        }
      }),
    );
    const items = projected.filter((item) => item !== null);
    const last = page.items.at(-1);

    return {
      items,
      nextCursor:
        page.hasMore && last
          ? encodeSavedSearchCursor(last, userId, q)
          : null,
    };
  }
}
