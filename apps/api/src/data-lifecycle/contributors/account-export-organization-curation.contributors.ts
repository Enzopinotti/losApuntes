import { Injectable } from '@nestjs/common';

import { OrganizationService } from '../../organizations/domain/organization.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class OrganizationAuthoredLinksExportContributor implements AccountExportContributor {
  readonly sectionId = 'organizations.authoredLinks';

  constructor(private readonly organizations: OrganizationService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.organizations.listAccountExportAuthoredLinks(
      input.userId,
      { limit: input.limit, cursor: input.cursor },
    );

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        organizationId: row.organizationId,
        label: row.label,
        url: row.url,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}

@Injectable()
export class OrganizationFeaturedResourcesExportContributor implements AccountExportContributor {
  readonly sectionId = 'organizations.featuredResources';

  constructor(private readonly organizations: OrganizationService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.organizations.listAccountExportFeaturedResources(
      input.userId,
      { limit: input.limit, cursor: input.cursor },
    );

    return {
      records: page.items.map((row): AccountExportRecord => ({
        organizationId: row.organizationId,
        resourceId: row.resourceId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
