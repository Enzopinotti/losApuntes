import { ConflictException, Inject, Injectable, InternalServerErrorException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import {
  SAVED_RESOURCE_SEARCH_STORE,
  type SavedResourceSearchStore,
} from './resource-saved-search.store';
import { ResourceService } from './resource.service';
import { boundedSavedQuery } from './resource-saved-query-budget';
import { AcademicService } from '../../academic/domain/academic.service';
import { decodeSavedTitleCursor, encodeSavedTitleCursor } from './resource-saved-title-cursor';
import type { SavedLibraryOrder } from './resource-saved-search.store';
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
    private readonly academic: AcademicService,
  ) {}

  async search(
    userId: string,
    rawQuery: string | undefined,
    limit: number,
    cursor?: string,
    subjectId?: string,
    order: SavedLibraryOrder = 'saved',
  ) {
    const q = rawQuery === undefined ? '' : normalizeSavedQuery(rawQuery);
    if (
      (rawQuery !== undefined && (q.length < 2 || q.length > 120)) ||
      (!q && !subjectId && order !== 'title') ||
      (order !== 'title' && order !== 'saved') ||
      (subjectId !== undefined &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(subjectId))
    ) {
      throw new UnprocessableEntityException({
        code: 'RESOURCE_SAVED_SEARCH_QUERY_INVALID',
        message: 'Saved library search needs valid text or a Subject',
      });
    }
    const after = order === 'saved'
      ? decodeSavedSearchCursor(cursor, userId, q, subjectId)
      : undefined;
    const titleAfter = order === 'title'
      ? decodeSavedTitleCursor(cursor, userId, q, subjectId)
      : undefined;
    if (after || titleAfter) {
      const fresh = await boundedSavedQuery(() => this.store.isSavedSearchAnchorCurrent({
        userId,
        ...(q ? { q } : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(after ? { after } : {}),
        ...(titleAfter ? { titleAfter } : {}),
      }));
      if (!fresh) {
        throw new ConflictException({
          code: 'RESOURCE_SAVED_SEARCH_CURSOR_STALE',
          message: 'Saved library changed; reload from the first page',
        });
      }
    }
    const page = await boundedSavedQuery(() => this.store.searchSavedResources({
      userId,
      ...(q ? { q } : {}),
      ...(subjectId ? { subjectId } : {}),
      limit,
      ...(order === 'title' ? { order } : {}),
      ...(after ? { after } : {}),
      ...(titleAfter ? { titleAfter } : {}),
    }));

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
    if (page.hasMore && last && order === 'title' && typeof last.title !== 'string') {
      throw new InternalServerErrorException('Saved title pagination is unavailable');
    }

    return {
      items,
      nextCursor:
        page.hasMore && last
          ? order === 'title'
            ? encodeSavedTitleCursor(
                { title: last.title!, resourceId: last.resourceId },
                userId, q, subjectId,
              )
            : encodeSavedSearchCursor(last, userId, q, subjectId)
          : null,
    };
  }

  /** Returned counts apply only to resources currently visible to the actor. */
  async listSubjects(userId: string) {
    const page = await boundedSavedQuery(() => this.store.listSavedSubjectFacets(userId));
    const readable = await Promise.all(page.items.map(async (row) => {
      try {
        const subject = await this.academic.getCatalogNode(row.subjectId);
        return {
          subjectId: row.subjectId,
          name: subject.node.name,
          count: row.count,
        };
      } catch (error) {
        if (error instanceof NotFoundException) return null;
        throw error;
      }
    }));
    const items = readable.filter((item) => item !== null).sort(
      (a, b) => a.name.localeCompare(b.name, 'es-AR', { sensitivity: 'base' }) ||
        a.subjectId.localeCompare(b.subjectId),
    );
    return { items, truncated: page.truncated };
  }
}
