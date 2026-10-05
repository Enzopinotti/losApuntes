import { Injectable } from '@nestjs/common';

import { AcademicService } from '../../academic/domain/academic.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

function assertSingletonCursor(sectionId: string, cursor: string | null): void {
  if (cursor !== null) {
    throw new Error(
      `Account export section ${sectionId} does not accept a cursor`,
    );
  }
}

@Injectable()
export class AcademicAffiliationsExportContributor implements AccountExportContributor {
  readonly sectionId = 'academic.affiliations';

  constructor(private readonly academic: AcademicService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.academic.listAccountExportAffiliations(
      input.userId,
      {
        limit: input.limit,
        cursor: input.cursor,
      },
    );

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        institutionId: row.institutionId,
        campusId: row.campusId,
        academicUnitId: row.academicUnitId,
        programId: row.programId,
        curriculumId: row.curriculumId,
        status: row.status,
        roles: row.roles,
        startedOn: row.startedOn,
        endedOn: row.endedOn,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}

@Injectable()
export class AcademicSubjectParticipationsExportContributor implements AccountExportContributor {
  readonly sectionId = 'academic.subjectParticipations';

  constructor(private readonly academic: AcademicService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.academic.listAccountExportSubjectParticipations(
      input.userId,
      {
        limit: input.limit,
        cursor: input.cursor,
      },
    );

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        subjectId: row.subjectId,
        courseOfferingId: row.courseOfferingId,
        state: row.state,
        periodLabel: row.periodLabel,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}

@Injectable()
export class AcademicCurrentContextExportContributor implements AccountExportContributor {
  readonly sectionId = 'academic.currentContext';

  constructor(private readonly academic: AcademicService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    assertSingletonCursor(this.sectionId, input.cursor);

    const context = await this.academic.getAccountExportCurrentContext(
      input.userId,
    );

    return {
      records: context
        ? [
            {
              affiliationId: context.affiliationId,
              subjectParticipationId: context.subjectParticipationId,
              revision: context.revision,
              updatedAt: context.updatedAt,
            },
          ]
        : [],
      nextCursor: null,
    };
  }
}

@Injectable()
export class AcademicFollowsExportContributor implements AccountExportContributor {
  readonly sectionId = 'academic.follows';

  constructor(private readonly academic: AcademicService) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    const page = await this.academic.listAccountExportFollows(input.userId, {
      limit: input.limit,
      cursor: input.cursor,
    });

    return {
      records: page.items.map((row): AccountExportRecord => ({
        id: row.id,
        targetNodeId: row.targetNodeId,
        targetKind: row.targetKind,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
