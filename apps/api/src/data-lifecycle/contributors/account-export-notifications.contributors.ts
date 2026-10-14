import { Injectable } from '@nestjs/common';

import { NotificationService } from '../../notifications/domain/notification.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class NotificationInboxExportContributor implements AccountExportContributor {
  readonly sectionId = 'notifications.inbox';

  constructor(private readonly notifications: NotificationService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.notifications.listAccountExportNotifications(
      input.userId,
      {
        limit: input.limit,
        cursor: input.cursor,
      },
    );

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        type: row.type,
        actorProfileId: row.actorProfileId,
        targetType: row.targetType,
        targetId: row.targetId,
        readAt: row.readAt,
        createdAt: row.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
