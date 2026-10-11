import { Injectable } from '@nestjs/common';

import { OrganizationService } from '../../organizations/domain/organization.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class OrganizationSubmittedReportsExportContributor implements AccountExportContributor {
  readonly sectionId = 'organizations.submittedReports';

  constructor(private readonly organizations: OrganizationService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.organizations.listAccountExportSubmittedReports(
      input.userId,
      {
        limit: input.limit,
        cursor: input.cursor,
      },
    );

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
