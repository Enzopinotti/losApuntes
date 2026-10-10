import { Injectable } from '@nestjs/common';

import { ResourceService } from '../../resources/domain/resource.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class AuthoredResourcesExportContributor implements AccountExportContributor {
  readonly sectionId = 'resources.authored';

  constructor(private readonly resources: ResourceService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.resources.listAccountExportResources(input.userId, {
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        title: row.title,
        description: row.description,
        tags: row.tags,
        subjectId: row.subjectId,
        courseOfferingId: row.courseOfferingId,
        visibility: row.visibility,
        moderationState: row.moderationState,
        revision: row.revision,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}

@Injectable()
export class SavedResourcesExportContributor implements AccountExportContributor {
  readonly sectionId = 'resources.saved';

  constructor(private readonly resources: ResourceService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.resources.listAccountExportSaves(input.userId, {
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      records: page.items.map((row): AccountExportRecord => ({
        resourceId: row.resourceId,
        savedAt: row.savedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
