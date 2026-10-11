import { Injectable } from '@nestjs/common';

import { OrganizationService } from '../../organizations/domain/organization.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class OrganizationFollowingExportContributor implements AccountExportContributor {
  readonly sectionId = 'organizations.following';

  constructor(private readonly organizations: OrganizationService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.organizations.listAccountExportFollowing(
      input.userId,
      {
        limit: input.limit,
        cursor: input.cursor,
      },
    );

    return {
      records: page.items.map((row): AccountExportRecord => ({
        organizationId: row.organizationId,
        followedAt: row.followedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
