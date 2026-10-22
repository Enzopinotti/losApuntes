import { Injectable } from '@nestjs/common';

import { StudyCollectionExportReader } from '../../study-collections/mongo/study-collection-export.reader';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

/**
 * Private owner data only. Resource IDs are references, not a permission to
 * download or inspect someone else's resources.
 */
@Injectable()
export class StudyCollectionsExportContributor implements AccountExportContributor {
  readonly sectionId = 'study.collections';

  constructor(private readonly collections: StudyCollectionExportReader) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.collections.listAccountExportCollections(
      input.userId,
      { limit: input.limit, cursor: input.cursor },
    );
    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        title: row.title,
        description: row.description,
        resourceIds: row.resourceIds,
        revision: row.revision,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
