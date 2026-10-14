import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { UsersService } from '../../users/users.service';
import { ACCOUNT_EXPORT_V1_SECTION_IDS } from './account-export-contributor.registry';
import {
  ACCOUNT_EXPORT_STORE,
  type AccountExportStore,
} from './account-export.store';
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_FORMAT_VERSION,
  ACCOUNT_EXPORT_ARTIFACT_TTL_MS,
  ACCOUNT_EXPORT_LEASE_DURATION_MS,
  ACCOUNT_EXPORT_PAGE_LIMIT,
  isAccountExportFailureCode,
  type AccountExportAssemblyResult,
  type AccountExportContributor,
  type AccountExportFailureCode,
  type AccountExportJobRecord,
} from './account-export.types';

export type AccountExportStatus = {
  id: string;
  format: typeof ACCOUNT_EXPORT_FORMAT;
  formatVersion: number;
  state: AccountExportJobRecord['state'];
  requestedAt: string;
  failureCode: AccountExportFailureCode | null;
  downloadExpiresAt: string | null;
  downloadable: boolean;
};

export type AccountExportDownload =
  | { kind: 'not_found' }
  | { kind: 'not_ready' }
  | { kind: 'expired' }
  | { kind: 'available'; generation: string; byteLength: number; sha256: string };

function assertCompletionResult(
  result: AccountExportAssemblyResult,
  completedAt: Date,
): void {
  if (
    result.format !== ACCOUNT_EXPORT_FORMAT ||
    result.formatVersion !== ACCOUNT_EXPORT_FORMAT_VERSION ||
    !Number.isSafeInteger(result.sectionCount) ||
    result.sectionCount !== ACCOUNT_EXPORT_V1_SECTION_IDS.length ||
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
    await this.assertActiveAccount(userId);

    const result = await this.store.requestActive({
      id: randomUUID(),
      userId,
      formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
      now,
    });

    return {
      created: result.created,
      export: this.publicStatus(result.job, now),
    };
  }

  async status(
    userId: string,
    id: string,
    now = new Date(),
  ): Promise<AccountExportStatus | null> {
    await this.assertActiveAccount(userId);
    const job = await this.store.findOwned(id, userId);
    return job ? this.publicStatus(job, now) : null;
  }

  async download(
    userId: string,
    id: string,
    now = new Date(),
  ): Promise<AccountExportDownload> {
    await this.assertActiveAccount(userId);
    const job = await this.store.findOwned(id, userId);
    if (!job) return { kind: 'not_found' };
    if (job.state !== 'completed') return { kind: 'not_ready' };
    if (
      !job.artifactGeneration ||
      !(job.artifactExpiresAt instanceof Date) ||
      job.artifactExpiresAt.getTime() <= now.getTime()
    ) {
      return { kind: 'expired' };
    }
    if (
      typeof job.artifactByteLength !== 'number' ||
      !Number.isSafeInteger(job.artifactByteLength) ||
      job.artifactByteLength < 1 ||
      typeof job.artifactSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(job.artifactSha256) ||
      job.formatVersion !== ACCOUNT_EXPORT_FORMAT_VERSION ||
      job.artifactSectionCount !== ACCOUNT_EXPORT_V1_SECTION_IDS.length
    ) {
      throw new Error('Account export artifact metadata is invalid');
    }

    return {
      kind: 'available',
      generation: job.artifactGeneration,
      byteLength: job.artifactByteLength,
      sha256: job.artifactSha256,
    };
  }

  async claimNext(): Promise<AccountExportJobRecord | null> {
    const now = new Date();
    const job = await this.store.claimNext({
      now,
      claimId: randomUUID(),
      leaseExpiresAt: new Date(
        now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
      ),
    });

    if (!job) return null;
    if (await this.users.hasActiveAccount(job.userId)) return job;
    if (!job.claimId) {
      throw new Error('Account export inactive claim is invalid');
    }

    await this.reschedule({
      id: job.id,
      claimId: job.claimId,
      state: 'failed',
      nextAttemptAt: now,
      failureCode: 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE',
    });
    return null;
  }

  async renewLease(input: { id: string; claimId: string }): Promise<boolean> {
    if (
      typeof input.id !== 'string' ||
      input.id.length === 0 ||
      typeof input.claimId !== 'string' ||
      input.claimId.length === 0
    ) {
      throw new Error('Account export lease claim is invalid');
    }

    const now = new Date();
    return this.store.renewLease({
      ...input,
      now,
      leaseExpiresAt: new Date(
        now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
      ),
    });
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
    return this.store.complete({
      ...input,
      artifactGeneration: input.claimId,
      completedAt,
      artifactExpiresAt: new Date(
        completedAt.getTime() + ACCOUNT_EXPORT_ARTIFACT_TTL_MS,
      ),
    });
  }

  async reschedule(input: {
    id: string;
    claimId: string;
    state: 'pending' | 'failed';
    nextAttemptAt: Date;
    failureCode: AccountExportFailureCode;
  }): Promise<boolean> {
    if (
      typeof input.id !== 'string' ||
      input.id.length === 0 ||
      typeof input.claimId !== 'string' ||
      input.claimId.length === 0 ||
      (input.state !== 'pending' && input.state !== 'failed') ||
      !(input.nextAttemptAt instanceof Date) ||
      !Number.isFinite(input.nextAttemptAt.getTime()) ||
      !isAccountExportFailureCode(input.failureCode)
    ) {
      throw new Error('Account export reschedule claim is invalid');
    }

    return this.store.reschedule({ ...input, now: new Date() });
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

  private publicStatus(
    job: AccountExportJobRecord,
    now: Date,
  ): AccountExportStatus {
    const downloadExpiresAt =
      job.state === 'completed' &&
      job.artifactExpiresAt instanceof Date &&
      Number.isFinite(job.artifactExpiresAt.getTime())
        ? job.artifactExpiresAt.toISOString()
        : null;

    return {
      id: job.id,
      format: ACCOUNT_EXPORT_FORMAT,
      formatVersion: job.formatVersion,
      state: job.state,
      requestedAt: job.createdAt.toISOString(),
      failureCode: isAccountExportFailureCode(job.failureCode)
        ? job.failureCode
        : null,
      downloadExpiresAt,
      downloadable:
        downloadExpiresAt !== null &&
        job.artifactExpiresAt!.getTime() > now.getTime() &&
        Boolean(job.artifactGeneration),
    };
  }

  async assertActiveAccount(userId: string): Promise<void> {
    if (await this.users.hasActiveAccount(userId)) return;

    throw new ForbiddenException({
      code: 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE',
      message: 'An active account is required for account export',
    });
  }
}
