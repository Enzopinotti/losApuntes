import { Injectable } from '@nestjs/common';

import { PilotEventService } from '../../pilot/telemetry/pilot-event.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class PilotActivityExportContributor implements AccountExportContributor {
  readonly sectionId = 'pilot.activity';

  constructor(private readonly pilotEvents: PilotEventService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.pilotEvents.listForAccountExport(input);

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        event: row.event,
        subjectId: row.subjectId ?? null,
        resultCount: row.resultCount ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
