import { Injectable } from '@nestjs/common';

import { AcademicService } from '../../academic/domain/academic.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class AcademicProposalsExportContributor implements AccountExportContributor {
  readonly sectionId = 'academic.proposals';

  constructor(private readonly academic: AcademicService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.academic.listAccountExportProposals(input.userId, {
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        kind: row.kind,
        proposedName: row.proposedName,
        parentIds: row.parentIds,
        evidenceUrl: row.evidenceUrl,
        notes: row.notes,
        createdAt: row.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
