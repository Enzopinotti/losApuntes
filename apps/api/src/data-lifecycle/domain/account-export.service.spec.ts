import { ForbiddenException } from '@nestjs/common';

import type { AccountExportStore } from './account-export.store';
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_FORMAT_VERSION,
  type AccountExportFailureCode,
  ACCOUNT_EXPORT_LEASE_DURATION_MS,
  ACCOUNT_EXPORT_PAGE_LIMIT,
  type AccountExportContributor,
  type AccountExportJobRecord,
} from './account-export.types';
import { AccountExportService } from './account-export.service';
import type { UsersService } from '../../users/users.service';

const now = new Date('2026-10-04T23:55:00.000Z');

function job(
  overrides: Partial<AccountExportJobRecord> = {},
): AccountExportJobRecord {
  return {
    id: 'export-1',
    userId: 'user-1',
    state: 'pending',
    active: true,
    formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
    attempts: 0,
    nextAttemptAt: now,
    claimId: null,
    leaseExpiresAt: null,
    failureCode: null,
    failedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function fixture() {
  const store = {
    requestActive: jest.fn(),
    findOwned: jest.fn(),
    claimNext: jest.fn(),
    renewLease: jest.fn(),
    reschedule: jest.fn(),
    complete: jest.fn(),
    hasFailed: jest.fn(),
  } as unknown as jest.Mocked<AccountExportStore>;
  const users = {
    hasActiveAccount: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<UsersService>;

  return {
    store,
    users,
    service: new AccountExportService(store, users),
  };
}

describe('AccountExportService', () => {
  it('creates one active export request and returns only public status fields', async () => {
    const f = fixture();
    f.store.requestActive.mockImplementation((input) =>
      Promise.resolve({
        created: true,
        job: job({ id: input.id, userId: input.userId }),
      }),
    );

    const result = await f.service.request('user-1', now);

    expect(result.created).toBe(true);
    expect(typeof result.export.id).toBe('string');
    expect(result.export).toEqual({
      id: result.export.id,
      format: ACCOUNT_EXPORT_FORMAT,
      formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
      state: 'pending',
      requestedAt: now.toISOString(),
      failureCode: null,
      downloadExpiresAt: null,
      downloadable: false,
    });
    expect(f.store.requestActive.mock.calls).toEqual([
      [
        {
          id: result.export.id,
          userId: 'user-1',
          formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
          now,
        },
      ],
    ]);
    expect(f.users.hasActiveAccount.mock.calls).toEqual([['user-1']]);
    expect(result.export).not.toHaveProperty('claimId');
    expect(result.export).not.toHaveProperty('leaseExpiresAt');
  });

  it.each(['missing', 'restricted', 'closed'])(
    'rejects a %s account before creating or replaying an export job',
    async () => {
      const f = fixture();
      f.users.hasActiveAccount.mockResolvedValue(false);

      const request = f.service.request('user-1', now);
      await expect(request).rejects.toBeInstanceOf(ForbiddenException);
      await expect(request).rejects.toMatchObject({
        response: {
          code: 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE',
        },
      });

      expect(f.users.hasActiveAccount.mock.calls).toEqual([['user-1']]);
      expect(f.store.requestActive.mock.calls).toEqual([]);
    },
  );

  it('propagates account-state read errors without touching the export store', async () => {
    const f = fixture();
    const readError = new Error('account state unavailable');
    f.users.hasActiveAccount.mockRejectedValue(readError);

    await expect(f.service.request('user-1', now)).rejects.toBe(readError);
    expect(f.store.requestActive.mock.calls).toEqual([]);
  });

  it.each(['missing', 'restricted', 'closed'])(
    'rejects %s account status before querying the export store',
    async () => {
      const f = fixture();
      f.users.hasActiveAccount.mockResolvedValue(false);

      await expect(
        f.service.status('user-1', 'export-1'),
      ).rejects.toMatchObject({
        response: { code: 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE' },
      });

      expect(f.users.hasActiveAccount.mock.calls).toEqual([['user-1']]);
      expect(f.store.findOwned.mock.calls).toHaveLength(0);
    },
  );

  it('propagates status account-state read errors before the export lookup', async () => {
    const f = fixture();
    const readError = new Error('account state unavailable');
    f.users.hasActiveAccount.mockRejectedValue(readError);

    await expect(f.service.status('user-1', 'export-1')).rejects.toBe(
      readError,
    );
    expect(f.store.findOwned.mock.calls).toHaveLength(0);
  });

  it('replays the existing active export instead of manufacturing another job', async () => {
    const f = fixture();
    f.store.requestActive.mockResolvedValue({
      created: false,
      job: job({ id: 'existing-export' }),
    });

    await expect(f.service.request('user-1', now)).resolves.toEqual({
      created: false,
      export: {
        id: 'existing-export',
        format: ACCOUNT_EXPORT_FORMAT,
        formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
        state: 'pending',
        requestedAt: now.toISOString(),
        failureCode: null,
        downloadExpiresAt: null,
        downloadable: false,
      },
    });
  });

  it('looks up status through the owner-scoped store boundary', async () => {
    const f = fixture();
    f.store.findOwned.mockResolvedValue(job({ state: 'processing' }));

    await expect(f.service.status('user-1', 'export-1')).resolves.toMatchObject(
      {
        id: 'export-1',
        state: 'processing',
      },
    );
    expect(f.store.findOwned.mock.calls).toEqual([['export-1', 'user-1']]);
    expect(f.users.hasActiveAccount.mock.calls).toEqual([['user-1']]);

    f.store.findOwned.mockResolvedValue(null);
    await expect(
      f.service.status('other-user', 'export-1'),
    ).resolves.toBeNull();
    expect(f.users.hasActiveAccount.mock.calls).toEqual([
      ['user-1'],
      ['other-user'],
    ]);
  });

  it('does not reflect an unknown historical failure code in status', async () => {
    const f = fixture();
    const legacyJob = {
      ...job({ state: 'failed', active: false }),
      failureCode: 'private-user@example.com',
    } as unknown as AccountExportJobRecord;
    f.store.findOwned.mockResolvedValue(legacyJob);

    await expect(f.service.status('user-1', 'export-1')).resolves.toMatchObject(
      { state: 'failed', failureCode: null },
    );
  });

  it('creates processing claims with a service-generated id and bounded lease', async () => {
    const f = fixture();
    jest.useFakeTimers().setSystemTime(now);
    try {
      f.store.claimNext.mockImplementation((input) =>
        Promise.resolve(
          job({
            state: 'processing',
            claimId: input.claimId,
            leaseExpiresAt: input.leaseExpiresAt,
          }),
        ),
      );

      const claimed = await f.service.claimNext();

      expect(claimed?.state).toBe('processing');
      expect(claimed?.claimId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(f.store.claimNext.mock.calls).toEqual([
        [
          {
            now,
            claimId: claimed?.claimId,
            leaseExpiresAt: new Date(
              now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
            ),
          },
        ],
      ]);
      expect(f.users.hasActiveAccount.mock.calls).toEqual([[claimed?.userId]]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails a claimed job for an inactive owner before handing it to a worker', async () => {
    const f = fixture();
    jest.useFakeTimers().setSystemTime(now);
    f.users.hasActiveAccount.mockResolvedValue(false);
    f.store.claimNext.mockResolvedValue(
      job({
        state: 'processing',
        claimId: 'claim-1',
        leaseExpiresAt: new Date(
          now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
        ),
      }),
    );
    f.store.reschedule.mockResolvedValue(true);

    try {
      await expect(f.service.claimNext()).resolves.toBeNull();
      expect(f.users.hasActiveAccount.mock.calls).toEqual([['user-1']]);
      expect(f.store.reschedule.mock.calls).toEqual([
        [
          {
            id: 'export-1',
            claimId: 'claim-1',
            state: 'failed',
            nextAttemptAt: now,
            failureCode: 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE',
            now,
          },
        ],
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not hand off or reschedule a claim when account-state lookup fails', async () => {
    const f = fixture();
    const readError = new Error('account state unavailable');
    f.store.claimNext.mockResolvedValue(
      job({ state: 'processing', claimId: 'claim-1' }),
    );
    f.users.hasActiveAccount.mockRejectedValue(readError);

    await expect(f.service.claimNext()).rejects.toBe(readError);
    expect(f.store.reschedule.mock.calls).toHaveLength(0);
  });

  it('does not read account state when no job was claimed', async () => {
    const f = fixture();
    f.store.claimNext.mockResolvedValue(null);

    await expect(f.service.claimNext()).resolves.toBeNull();
    expect(f.users.hasActiveAccount.mock.calls).toHaveLength(0);
  });

  it('renews only the supplied claim with a service-generated bounded lease', async () => {
    const f = fixture();
    jest.useFakeTimers().setSystemTime(now);
    try {
      f.store.renewLease.mockResolvedValue(true);

      await expect(
        f.service.renewLease({ id: 'export-1', claimId: 'claim-1' }),
      ).resolves.toBe(true);
      expect(f.store.renewLease.mock.calls).toEqual([
        [
          {
            id: 'export-1',
            claimId: 'claim-1',
            now,
            leaseExpiresAt: new Date(
              now.getTime() + ACCOUNT_EXPORT_LEASE_DURATION_MS,
            ),
          },
        ],
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects invalid renewal claims before persistence', async () => {
    const f = fixture();

    await expect(
      f.service.renewLease({ id: 'export-1', claimId: '' }),
    ).rejects.toThrow('lease claim is invalid');
    expect(f.store.renewLease.mock.calls).toHaveLength(0);
  });

  it('records only a valid committed assembly result through the store', async () => {
    const f = fixture();
    jest.useFakeTimers().setSystemTime(now);
    try {
      const result = {
        format: ACCOUNT_EXPORT_FORMAT,
        formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
        sectionCount: 3,
        recordCount: 7,
        byteLength: 512,
        sha256: 'a'.repeat(64),
      } as const;
      f.store.complete.mockResolvedValue(true);

      await expect(
        f.service.complete({
          id: 'export-1',
          claimId: 'claim-1',
          result,
        }),
      ).resolves.toBe(true);
      expect(f.store.complete.mock.calls).toEqual([
        [
          {
            id: 'export-1',
            claimId: 'claim-1',
            artifactGeneration: 'claim-1',
            completedAt: now,
            artifactExpiresAt: new Date(
              now.getTime() + 7 * 24 * 60 * 60 * 1000,
            ),
            result,
          },
        ],
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fences rescheduling with a service-owned current timestamp', async () => {
    const f = fixture();
    jest.useFakeTimers().setSystemTime(now);
    try {
      f.store.reschedule.mockResolvedValue(true);

      await expect(
        f.service.reschedule({
          id: 'export-1',
          claimId: 'claim-1',
          state: 'pending',
          nextAttemptAt: now,
          failureCode: 'EXPORT_ASSEMBLY_RETRY',
        }),
      ).resolves.toBe(true);

      expect(f.store.reschedule.mock.calls).toEqual([
        [
          {
            id: 'export-1',
            claimId: 'claim-1',
            state: 'pending',
            nextAttemptAt: now,
            failureCode: 'EXPORT_ASSEMBLY_RETRY',
            now,
          },
        ],
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects malformed reschedule claims before persistence', async () => {
    const f = fixture();

    await expect(
      f.service.reschedule({
        id: 'export-1',
        claimId: 'claim-1',
        state: 'completed' as never,
        nextAttemptAt: now,
        failureCode: 'EXPORT_ASSEMBLY_RETRY',
      }),
    ).rejects.toThrow('reschedule claim is invalid');
    expect(f.store.reschedule.mock.calls).toHaveLength(0);
  });

  it('rejects a non-contract failure code before persistence', async () => {
    const f = fixture();

    await expect(
      f.service.reschedule({
        id: 'export-1',
        claimId: 'claim-1',
        state: 'failed',
        nextAttemptAt: now,
        failureCode: 'private-user@example.com' as AccountExportFailureCode,
      }),
    ).rejects.toThrow('reschedule claim is invalid');
    expect(f.store.reschedule.mock.calls).toHaveLength(0);
  });

  it.each([
    { sha256: 'not-a-digest' },
    { sectionCount: -1 },
    { recordCount: Number.MAX_SAFE_INTEGER + 1 },
    { byteLength: 0 },
  ])(
    'rejects malformed completion metadata before persistence',
    async (change) => {
      const f = fixture();
      const result = {
        format: ACCOUNT_EXPORT_FORMAT,
        formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
        sectionCount: 3,
        recordCount: 7,
        byteLength: 512,
        sha256: 'a'.repeat(64),
        ...change,
      };

      await expect(
        f.service.complete({
          id: 'export-1',
          claimId: 'claim-1',
          result: result as never,
        }),
      ).rejects.toThrow('completion metadata is invalid');
      expect(f.store.complete.mock.calls).toHaveLength(0);
    },
  );

  it('keeps completion integrity metadata out of owner status', async () => {
    const f = fixture();
    f.store.findOwned.mockResolvedValue(
      job({
        state: 'completed',
        active: false,
        completedAt: now,
        artifactSectionCount: 3,
        artifactRecordCount: 7,
        artifactByteLength: 512,
        artifactSha256: 'a'.repeat(64),
        artifactGeneration: 'generation-1',
        artifactExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      }),
    );

    const status = await f.service.status('user-1', 'export-1', now);

    expect(status?.state).toBe('completed');
    expect(status?.downloadable).toBe(true);
    expect(status?.downloadExpiresAt).toBe(
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(status).not.toHaveProperty('completedAt');
    expect(status).not.toHaveProperty('artifactByteLength');
    expect(status).not.toHaveProperty('artifactSha256');
    expect(status).not.toHaveProperty('artifactGeneration');
  });

  it('reauthorizes every download and rejects expired or incomplete artifacts', async () => {
    const f = fixture();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    f.store.findOwned
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(job({ state: 'processing', claimId: 'claim-1' }))
      .mockResolvedValueOnce(
        job({
          state: 'completed',
          active: false,
          artifactGeneration: 'generation-1',
          artifactExpiresAt: expiresAt,
          artifactByteLength: 512,
        }),
      )
      .mockResolvedValueOnce(
        job({
          state: 'completed',
          active: false,
          artifactGeneration: 'generation-1',
          artifactExpiresAt: now,
          artifactByteLength: 512,
        }),
      );

    await expect(f.service.download('user-1', 'missing', now)).resolves.toEqual(
      { kind: 'not_found' },
    );
    await expect(
      f.service.download('user-1', 'export-1', now),
    ).resolves.toEqual({ kind: 'not_ready' });
    await expect(
      f.service.download('user-1', 'export-1', now),
    ).resolves.toEqual({
      kind: 'available',
      generation: 'generation-1',
      byteLength: 512,
    });
    await expect(
      f.service.download('user-1', 'export-1', now),
    ).resolves.toEqual({ kind: 'expired' });
    expect(f.users.hasActiveAccount.mock.calls).toHaveLength(4);
  });

  it('forces contributors through the bounded page budget', async () => {
    const f = fixture();
    const readPage = jest.fn().mockResolvedValue({
      records: [{ profileId: 'profile-1' }],
      nextCursor: 'next',
    });
    const contributor: AccountExportContributor = {
      sectionId: 'profile',
      readPage,
    };

    await expect(
      f.service.readContributorPage(contributor, 'user-1', 'cursor'),
    ).resolves.toEqual({
      records: [{ profileId: 'profile-1' }],
      nextCursor: 'next',
    });
    expect(readPage).toHaveBeenCalledWith({
      userId: 'user-1',
      cursor: 'cursor',
      limit: ACCOUNT_EXPORT_PAGE_LIMIT,
    });
  });

  it('rejects malformed or over-budget contributor pages', async () => {
    const f = fixture();
    const emptyId: AccountExportContributor = {
      sectionId: '   ',
      readPage: jest.fn(),
    };
    await expect(
      f.service.readContributorPage(emptyId, 'user-1', null),
    ).rejects.toThrow('sectionId is required');

    const oversized: AccountExportContributor = {
      sectionId: 'resources',
      readPage: jest.fn().mockResolvedValue({
        records: Array.from({ length: ACCOUNT_EXPORT_PAGE_LIMIT + 1 }, () => ({
          id: 'resource',
        })),
        nextCursor: null,
      }),
    };
    await expect(
      f.service.readContributorPage(oversized, 'user-1', null),
    ).rejects.toThrow('exceeded the page limit');
  });
});
