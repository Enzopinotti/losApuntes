import { Injectable } from '@nestjs/common';

import { QaService } from '../../qa/domain/qa.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class AuthoredQuestionsExportContributor implements AccountExportContributor {
  readonly sectionId = 'qa.authoredQuestions';

  constructor(private readonly qa: QaService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.qa.listAccountExportQuestions(input.userId, {
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        subjectId: row.subjectId,
        courseOfferingId: row.courseOfferingId,
        title: row.title,
        body: row.body,
        state: row.state,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}

@Injectable()
export class AuthoredAnswersExportContributor implements AccountExportContributor {
  readonly sectionId = 'qa.authoredAnswers';

  constructor(private readonly qa: QaService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.qa.listAccountExportAnswers(input.userId, {
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        questionId: row.questionId,
        body: row.body,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
