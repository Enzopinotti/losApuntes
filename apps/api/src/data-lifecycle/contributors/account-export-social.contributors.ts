import { Injectable } from '@nestjs/common';

import { SocialService } from '../../social/domain/social.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class SocialFollowingExportContributor implements AccountExportContributor {
  readonly sectionId = 'social.following';

  constructor(private readonly social: SocialService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.social.listAccountExportFollowing(input.userId, {
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      records: page.items.map((row): AccountExportRecord => ({
        followeeProfileId: row.followeeProfileId,
        followedAt: row.followedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}

@Injectable()
export class SocialConnectionsExportContributor implements AccountExportContributor {
  readonly sectionId = 'social.connections';

  constructor(private readonly social: SocialService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.social.listAccountExportConnections(input.userId, {
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      records: page.items.map((row): AccountExportRecord => ({
        counterpartProfileId: row.counterpartProfileId,
        status: row.status,
        requestedByOwner: row.requestedByOwner,
        createdAt: row.createdAt,
        respondedAt: row.respondedAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
