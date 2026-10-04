import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  ACCOUNT_EXPORT_STORE,
  type AccountExportStore,
} from './account-export.store';
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_FORMAT_VERSION,
  ACCOUNT_EXPORT_PAGE_LIMIT,
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

@Injectable()
export class AccountExportService {
  constructor(
    @Inject(ACCOUNT_EXPORT_STORE)
    private readonly store: AccountExportStore,
  ) {}

  async request(
    userId: string,
    now = new Date(),
  ): Promise<{ created: boolean; export: AccountExportStatus }> {
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

  validateContributor(contributor: AccountExportContributor): void {
    if (!contributor.sectionId.trim()) {
      throw new Error('Account export contributor sectionId is required');
    }
  }

  contributorPageLimit(): number {
    return ACCOUNT_EXPORT_PAGE_LIMIT;
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
