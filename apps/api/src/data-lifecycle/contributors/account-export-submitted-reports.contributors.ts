import { Injectable } from '@nestjs/common';

import { QaService } from '../../qa/domain/qa.service';
import { ResourceService } from '../../resources/domain/resource.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class QaSubmittedReportsExportContributor implements AccountExportContributor {
  readonly sectionId = 'qa.submittedReports';

  constructor(private readonly qa: QaService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.qa.listAccountExportSubmittedReports(input.userId, {
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        details: row.details,
        createdAt: row.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}

@Injectable()
export class ResourceSubmittedReportsExportContributor implements AccountExportContributor {
  readonly sectionId = 'resources.submittedReports';

  constructor(private readonly resources: ResourceService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.resources.listAccountExportSubmittedReports(
      input.userId,
      {
        limit: input.limit,
        cursor: input.cursor,
      },
    );

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        resourceId: row.resourceId,
        reason: row.reason,
        details: row.details,
        createdAt: row.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
