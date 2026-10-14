import { Injectable } from '@nestjs/common';

import { OrganizationService } from '../../organizations/domain/organization.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class OrganizationManagementExportContributor implements AccountExportContributor {
  readonly sectionId = 'organizations.management';

  constructor(private readonly organizations: OrganizationService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.organizations.listAccountExportManagement(
      input.userId,
      {
        limit: input.limit,
        cursor: input.cursor,
      },
    );

    return {
      records: page.items.map((row): AccountExportRecord => ({
        organizationId: row.organizationId,
        role: row.role,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
