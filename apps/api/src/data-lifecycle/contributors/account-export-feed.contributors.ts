import { Injectable } from '@nestjs/common';

import { FeedService } from '../../feeds/domain/feed.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class FeedPreferencesExportContributor implements AccountExportContributor {
  readonly sectionId = 'feeds.preferences';

  constructor(private readonly feeds: FeedService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    if (input.cursor !== null) {
      throw new Error('Feed preferences export does not accept a cursor');
    }

    const row = await this.feeds.findAccountExportPreferences(input.userId);
    return {
      records: row
        ? [
            {
              useAcademic: row.useAcademic,
              useSocial: row.useSocial,
              useInterests: row.useInterests,
              mutedSubjectIds: row.mutedSubjectIds,
              mutedProfileIds: row.mutedProfileIds,
              prioritizedSubjectIds: row.prioritizedSubjectIds,
              createdAt: row.createdAt.toISOString(),
              updatedAt: row.updatedAt.toISOString(),
            } satisfies AccountExportRecord,
          ]
        : [],
      nextCursor: null,
    };
  }
}

@Injectable()
export class FeedFeedbackExportContributor implements AccountExportContributor {
  readonly sectionId = 'feeds.feedback';

  constructor(private readonly feeds: FeedService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.feeds.listAccountExportFeedback(input.userId, {
      cursor: input.cursor,
      limit: input.limit,
    });

    return {
      records: page.items.map((row): AccountExportRecord => ({
        targetType: row.targetType,
        targetId: row.targetId,
        signal: row.signal,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
