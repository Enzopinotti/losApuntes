import { Injectable } from '@nestjs/common';

import { OrganizationService } from '../../organizations/domain/organization.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class OrganizationAuthoredPostsExportContributor implements AccountExportContributor {
  readonly sectionId = 'organizations.authoredPosts';

  constructor(private readonly organizations: OrganizationService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.organizations.listAccountExportAuthoredPosts(
      input.userId,
      {
        limit: input.limit,
        cursor: input.cursor,
      },
    );

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        organizationId: row.organizationId,
        title: row.title,
        body: row.body,
        subjectId: row.subjectId,
        publishedAt: row.publishedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}

@Injectable()
export class OrganizationAuthoredEventsExportContributor implements AccountExportContributor {
  readonly sectionId = 'organizations.authoredEvents';

  constructor(private readonly organizations: OrganizationService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.organizations.listAccountExportAuthoredEvents(
      input.userId,
      {
        limit: input.limit,
        cursor: input.cursor,
      },
    );

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        organizationId: row.organizationId,
        title: row.title,
        description: row.description,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        locationLabel: row.locationLabel,
        externalUrl: row.externalUrl,
        state: row.state,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
