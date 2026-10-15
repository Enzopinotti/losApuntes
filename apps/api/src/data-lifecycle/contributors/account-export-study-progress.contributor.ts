import { Injectable } from '@nestjs/common';
import { StudyProgressExportReader } from '../../study-progress/mongo/study-progress-export.reader';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

/** Portable student-authored plan, never expanded third-party content. */
@Injectable()
export class StudyProgressExportContributor implements AccountExportContributor {
  readonly sectionId = 'study.progress';
  constructor(private readonly progress: StudyProgressExportReader) {}

  async readPage(input: {
    userId: string; cursor: string | null; limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.progress.listAccountExportProgress(input.userId, {
      cursor: input.cursor,
      limit: input.limit,
    });
    return {
      records: page.items.map((row): AccountExportRecord => ({
        subjectId: row.subjectId,
        plan: row.plan,
        revision: row.revision,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
