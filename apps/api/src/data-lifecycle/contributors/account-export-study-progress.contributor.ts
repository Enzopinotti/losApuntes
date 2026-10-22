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
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.progress.listAccountExportProgress(input.userId, {
      cursor: input.cursor,
      limit: input.limit,
    });
    return {
      records: page.items.map((row): AccountExportRecord => {
        // StudyProgressPlan is a typed domain object, not an index-signature
        // JSON record. Explicitly materialize only portable fields instead
        // of casting it or serializing the Mongo object wholesale.
        const plan: AccountExportRecord = {
          format: row.plan.format,
          version: row.plan.version,
          subjectId: row.plan.subjectId,
          title: row.plan.title,
          notes: row.plan.notes,
          startsAt: row.plan.startsAt,
          tasks: row.plan.tasks.map((task): AccountExportRecord => ({
            kind: task.kind,
            id: task.id,
            minutes: task.minutes,
            done: task.done,
          })),
        };
        return {
          subjectId: row.subjectId,
          plan,
          revision: row.revision,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
      nextCursor: page.nextCursor,
    };
  }
}
