import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { UsersService } from '../../users/users.service';
import {
  ACCOUNT_EXPORT_STORE,
  type AccountExportStore,
} from './account-export.store';
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_FORMAT_VERSION,
  ACCOUNT_EXPORT_PAGE_LIMIT,
  type AccountExportAssemblyResult,
  type AccountExportContributor,
  type AccountExportJobRecord,
} from './account-export.types';

export type AccountExportStatus = {
  id: string;
  format: typeof ACCOUNT_EXPORT_FORMAT;
  formatVersion: number;
  state: AccountExportJobRecord['state'];
  requestedAt: string;
  failureCode: string | null;
};

function assertCompletionResult(
  result: AccountExportAssemblyResult,
  completedAt: Date,
): void {
  if (
    result.format !== ACCOUNT_EXPORT_FORMAT ||
    result.formatVersion !== ACCOUNT_EXPORT_FORMAT_VERSION ||
    !Number.isSafeInteger(result.sectionCount) ||
    result.sectionCount < 0 ||
    !Number.isSafeInteger(result.recordCount) ||
    result.recordCount < 0 ||
    !Number.isSafeInteger(result.byteLength) ||
    result.byteLength < 1 ||
    !/^[a-f0-9]{64}$/u.test(result.sha256) ||
    !(completedAt instanceof Date) ||
    !Number.isFinite(completedAt.getTime())
  ) {
    throw new Error('Account export completion metadata is invalid');
  }
}

@Injectable()
export class AccountExportService {
  constructor(
    @Inject(ACCOUNT_EXPORT_STORE)
    private readonly store: AccountExportStore,
    private readonly users: UsersService,
  ) {}

  async request(
    userId: string,
    now = new Date(),
  ): Promise<{ created: boolean; export: AccountExportStatus }> {
    if (!(await this.users.hasActiveAccount(userId))) {
      throw new ForbiddenException({
        code: 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE',
        message: 'An active account is required to request an export',
      });
    }

    const result = await this.store.requestActive({
      id: randomUUID(),
      userId,
      formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
      now,
    });

    return {
      created: result.created,
      export: this.publicStatus(result.job),
    };
  }

  async status(
    userId: string,
    id: string,
  ): Promise<AccountExportStatus | null> {
    const job = await this.store.findOwned(id, userId);
    return job ? this.publicStatus(job) : null;
  }

  async complete(input: {
    id: string;
    claimId: string;
    result: AccountExportAssemblyResult;
  }): Promise<boolean> {
    if (
      typeof input.id !== 'string' ||
      input.id.length === 0 ||
      typeof input.claimId !== 'string' ||
      input.claimId.length === 0 ||
      typeof input.result !== 'object' ||
      input.result === null
    ) {
      throw new Error('Account export completion claim is invalid');
    }

    const completedAt = new Date();
    assertCompletionResult(input.result, completedAt);
    return this.store.complete({ ...input, completedAt });
  }

  async readContributorPage(
    contributor: AccountExportContributor,
    userId: string,
    cursor: string | null,
  ) {
    if (!contributor.sectionId.trim()) {
      throw new Error('Account export contributor sectionId is required');
    }

    const page = await contributor.readPage({
      userId,
      cursor,
      limit: ACCOUNT_EXPORT_PAGE_LIMIT,
    });

    if (page.records.length > ACCOUNT_EXPORT_PAGE_LIMIT) {
      throw new Error('Account export contributor exceeded the page limit');
    }

    return page;
  }

  private publicStatus(job: AccountExportJobRecord): AccountExportStatus {
    return {
      id: job.id,
      format: ACCOUNT_EXPORT_FORMAT,
      formatVersion: job.formatVersion,
      state: job.state,
      requestedAt: job.createdAt.toISOString(),
      failureCode: job.failureCode,
    };
  }
}
