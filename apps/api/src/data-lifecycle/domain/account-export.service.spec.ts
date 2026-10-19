import { ConflictException, ForbiddenException } from '@nestjs/common';

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
    isOwnedArtifactCurrent: jest.fn().mockResolvedValue(true),
    claimNext: jest.fn(),
    renewLease: jest.fn(),
    reschedule: jest.fn(),
    complete: jest.fn(),
    hasFailed: jest.fn(),
  } as unknown as jest.Mocked<AccountExportStore>;
  const users = {
    hasActiveAccount: jest.fn().mockResolvedValue(true),
    getStudyProgressExportEpoch: jest.fn().mockResolvedValue(5),
  } as unknown as jest.Mocked<UsersService>;

  return {
    store,
    users,
    service: new AccountExportService(store, users),
  };
}

describe('AccountExportService', () => {
  it('B64 validates a stable owner revision and rejects concurrent updates', async () => {
    const f = fixture();
    await expect(
      f.service.captureStudyProgressExportEpoch('user-1'),
    ).resolves.toBe(5);
    await expect(
      f.service.assertStudyProgressExportEpoch('user-1', 5),
    ).resolves.toBeUndefined();
    f.users.getStudyProgressExportEpoch.mockResolvedValueOnce(6);
    await expect(
      f.service.assertStudyProgressExportEpoch('user-1', 5),
    ).rejects.toThrow('Study progress changed during account export');
    expect(f.users.getStudyProgressExportEpoch.mock.calls).toContainEqual([
      'user-1',
    ]);
  });

  it('B64 fails closed on invalid owner epochs or source outages', async () => {
    const f = fixture();
    for (const invalid of [-1, Number.NaN, 0.5]) {
      await expect(
        f.service.assertStudyProgressExportEpoch('user-1', invalid),
      ).rejects.toThrow('epoch is invalid');
    }
    const failure = new Error('epoch database unavailable');
    f.users.getStudyProgressExportEpoch.mockRejectedValueOnce(failure);
    await expect(
      f.service.captureStudyProgressExportEpoch('user-1'),
    ).rejects.toBe(failure);
  });

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
        sectionCount: 30,
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
    { sectionCount: 29 },
    { sectionCount: 31 },
    { recordCount: Number.MAX_SAFE_INTEGER + 1 },
    { byteLength: 0 },
  ])(
    'rejects malformed completion metadata before persistence',
    async (change) => {
      const f = fixture();
      const result = {
        format: ACCOUNT_EXPORT_FORMAT,
        formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
        sectionCount: 30,
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
        artifactSectionCount: 30,
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

  it.each([
    { artifactSectionCount: 29 },
    { artifactSectionCount: 31 },
    { artifactSha256: null },
    { artifactSha256: 'INVALID-DIGEST' },
    { artifactByteLength: 0 },
    { formatVersion: 2 },
  ])(
    'never advertises incomplete export artifact metadata as downloadable (%o)',
    async (change) => {
      const f = fixture();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      f.store.findOwned.mockResolvedValue(
        job({
          state: 'completed',
          active: false,
          artifactGeneration: 'generation-1',
          artifactExpiresAt: expiresAt,
          artifactSectionCount: 30,
          artifactRecordCount: 1,
          artifactByteLength: 512,
          artifactSha256: 'a'.repeat(64),
          ...change,
        }),
      );

      const status = await f.service.status('user-1', 'export-1', now);
      expect(status?.downloadable).toBe(false);
      await expect(
        f.service.download('user-1', 'export-1', now),
      ).rejects.toThrow('artifact metadata is invalid');
      expect(f.store.findOwned.mock.calls).toContainEqual([
        'export-1',
        'user-1',
      ]);
    },
  );

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
          artifactSectionCount: 30,
          artifactSha256: 'a'.repeat(64),
        }),
      )
      .mockResolvedValueOnce(
        job({
          state: 'completed',
          active: false,
          artifactGeneration: 'generation-1',
          artifactExpiresAt: now,
          artifactByteLength: 512,
          artifactSectionCount: 30,
          artifactSha256: 'a'.repeat(64),
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
      formatVersion: 1,
      generation: 'generation-1',
      byteLength: 512,
      sha256: 'a'.repeat(64),
    });
    // B93 expiration is decided by the primary's $NOW, not the client
    // test timestamp supplied to the service.
    f.store.isOwnedArtifactCurrent.mockResolvedValueOnce(false);
    await expect(
      f.service.download('user-1', 'export-1', now),
    ).resolves.toEqual({ kind: 'expired' });
    expect(f.users.hasActiveAccount.mock.calls).toHaveLength(4);
  });

  it('B93 status uses the Mongo primary even if the worker clock is far ahead', async () => {
    const f = fixture();
    const expiresAt = new Date(now.getTime() + 60_000);
    f.store.findOwned.mockResolvedValue(
      job({
        state: 'completed',
        active: false,
        artifactGeneration: 'generation-1',
        artifactExpiresAt: expiresAt,
        artifactSectionCount: 30,
        artifactByteLength: 512,
        artifactSha256: 'a'.repeat(64),
      }),
    );
    f.store.isOwnedArtifactCurrent.mockResolvedValue(true);
    const clientAhead = new Date(expiresAt.getTime() + 60_000);
    await expect(
      f.service.status('user-1', 'export-1', clientAhead),
    ).resolves.toMatchObject({ downloadable: true });
    await expect(
      f.service.download('user-1', 'export-1', clientAhead),
    ).resolves.toMatchObject({ kind: 'available', generation: 'generation-1' });
    expect(f.store.isOwnedArtifactCurrent.mock.calls).toContainEqual([
      {
        id: 'export-1',
        userId: 'user-1',
        generation: 'generation-1',
        expiresAt,
      },
    ]);
  });

  it('B93 status and download deny expiry even with worker clock far behind', async () => {
    const f = fixture();
    const expiresAt = new Date(now.getTime() + 60_000);
    f.store.findOwned.mockResolvedValue(
      job({
        state: 'completed',
        active: false,
        artifactGeneration: 'generation-1',
        artifactExpiresAt: expiresAt,
        artifactSectionCount: 30,
        artifactByteLength: 512,
        artifactSha256: 'a'.repeat(64),
      }),
    );
    f.store.isOwnedArtifactCurrent.mockResolvedValue(false);
    await expect(
      f.service.status('user-1', 'export-1', now),
    ).resolves.toMatchObject({ downloadable: false });
    await expect(
      f.service.download('user-1', 'export-1', now),
    ).resolves.toEqual({ kind: 'expired' });
  });

  it('B93 fails closed if the primary eligibility probe fails', async () => {
    const f = fixture();
    f.store.findOwned.mockResolvedValue(
      job({
        state: 'completed',
        active: false,
        artifactGeneration: 'generation-1',
        artifactExpiresAt: new Date(now.getTime() + 60_000),
        artifactSectionCount: 30,
        artifactByteLength: 512,
        artifactSha256: 'a'.repeat(64),
      }),
    );
    f.store.isOwnedArtifactCurrent.mockRejectedValue(
      new Error('Mongo primary down'),
    );
    await expect(f.service.status('user-1', 'export-1', now)).rejects.toThrow(
      'Mongo primary down',
    );
    await expect(f.service.download('user-1', 'export-1', now)).rejects.toThrow(
      'Mongo primary down',
    );
  });

  it('does not find a completed export when another active account requests it', async () => {
    const f = fixture();
    f.store.findOwned.mockResolvedValue(null);

    await expect(
      f.service.download('other-user', 'export-1', now),
    ).resolves.toEqual({ kind: 'not_found' });

    expect(f.users.hasActiveAccount.mock.calls).toEqual([['other-user']]);
    expect(f.store.findOwned.mock.calls).toEqual([['export-1', 'other-user']]);
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
    expect(readPage.mock.calls).toContainEqual([
      {
        userId: 'user-1',
        cursor: 'cursor',
        limit: ACCOUNT_EXPORT_PAGE_LIMIT,
      },
    ]);
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

  it('accepts v2 completion only with the exact 31-section manifest', async () => {
    const f = fixture();
    f.store.complete.mockResolvedValueOnce(true);
    const v2 = {
      format: ACCOUNT_EXPORT_FORMAT,
      formatVersion: 2 as const,
      sectionCount: 31,
      recordCount: 4,
      byteLength: 1024,
      sha256: 'b'.repeat(64),
    };
    await expect(
      f.service.complete({
        id: 'export-2',
        claimId: 'claim-2',
        result: v2,
      }),
    ).resolves.toBe(true);
    expect(f.store.complete.mock.calls).toContainEqual([
      expect.objectContaining({ result: v2 }),
    ]);
    await expect(
      f.service.complete({
        id: 'export-2',
        claimId: 'claim-2',
        result: { ...v2, sectionCount: 30 },
      }),
    ).rejects.toThrow('completion metadata is invalid');
    await expect(
      f.service.complete({
        id: 'export-2',
        claimId: 'claim-2',
        result: { ...v2, formatVersion: 4 as 2 },
      }),
    ).rejects.toThrow('completion metadata is invalid');
  });

  it('B65 refuses an unfenced v3 completion and passes owner epoch to Mongo CAS', async () => {
    const f = fixture();
    const v3 = {
      format: ACCOUNT_EXPORT_FORMAT,
      formatVersion: 3 as const,
      sectionCount: 32,
      recordCount: 1,
      byteLength: 1000,
      sha256: 'b'.repeat(64),
    };
    await expect(
      f.service.complete({
        id: 'export-3',
        claimId: 'claim-3',
        result: v3,
      }),
    ).rejects.toThrow('owner epoch authority');
    expect(f.store.complete.mock.calls).toHaveLength(0);
    f.store.complete.mockResolvedValueOnce(true);
    await expect(
      f.service.complete({
        id: 'export-3',
        claimId: 'claim-3',
        result: v3,
        ownerUserId: 'owner-1',
        expectedProgressEpoch: 7,
      }),
    ).resolves.toBe(true);
    expect(f.store.complete.mock.calls).toContainEqual([
      expect.objectContaining({
        result: v3,
        ownerUserId: 'owner-1',
        expectedProgressEpoch: 7,
      }),
    ]);
    await expect(
      f.service.complete({
        id: 'export-3',
        claimId: 'claim-3',
        result: v3,
        ownerUserId: 'owner-1',
        expectedProgressEpoch: -1,
      }),
    ).rejects.toThrow('owner epoch authority');
    expect(f.store.complete.mock.calls).toHaveLength(1);
  });

  it('validates v2 artifact metadata without accepting a 30-section v1 artifact', async () => {
    const f = fixture();
    const expiresAt = new Date(now.getTime() + 60_000);
    f.store.findOwned
      .mockResolvedValueOnce(
        job({
          state: 'completed',
          active: false,
          formatVersion: 2,
          artifactSectionCount: 31,
          artifactByteLength: 1024,
          artifactSha256: 'b'.repeat(64),
          artifactGeneration: 'generation-v2',
          artifactExpiresAt: expiresAt,
        }),
      )
      .mockResolvedValueOnce(
        job({
          state: 'completed',
          active: false,
          formatVersion: 2,
          artifactSectionCount: 31,
          artifactByteLength: 1024,
          artifactSha256: 'b'.repeat(64),
          artifactGeneration: 'generation-v2',
          artifactExpiresAt: expiresAt,
        }),
      )
      .mockResolvedValueOnce(
        job({
          state: 'completed',
          active: false,
          formatVersion: 2,
          artifactSectionCount: 30,
          artifactByteLength: 1024,
          artifactSha256: 'b'.repeat(64),
          artifactGeneration: 'generation-v2',
          artifactExpiresAt: expiresAt,
        }),
      );
    const publicStatus = await f.service.status('user-1', 'export-2', now);
    expect(publicStatus?.downloadable).toBe(true);
    expect(publicStatus?.formatVersion).toBe(2);
    await expect(
      f.service.download('user-1', 'export-2', now),
    ).resolves.toEqual({
      kind: 'available',
      formatVersion: 2,
      generation: 'generation-v2',
      byteLength: 1024,
      sha256: 'b'.repeat(64),
    });
    await expect(f.service.download('user-1', 'export-2', now)).rejects.toThrow(
      'artifact metadata is invalid',
    );
  });

  const emptyProgressReader = {
    hasOwnedProgress: jest.fn().mockResolvedValue(false),
  };

  it('B63: rejects a v1 job when its owner saves progress during the upsert', async () => {
    const f = fixture();
    const progress = {
      hasOwnedProgress: jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    };
    const service = new AccountExportService(
      f.store,
      f.users,
      { get: () => false } as never,
      { hasOwnedCollections: jest.fn().mockResolvedValue(false) } as never,
      progress as never,
    );
    f.store.requestActive.mockImplementation((input) =>
      Promise.resolve({
        created: true,
        job: job({ formatVersion: input.formatVersion }),
      }),
    );
    await expect(service.request('user-1', now)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_EXPORT_LEGACY_JOB_ACTIVE' },
    });
    expect(f.store.requestActive.mock.calls).toContainEqual([
      expect.objectContaining({ userId: 'user-1', formatVersion: 1 }),
    ]);
    expect(progress.hasOwnedProgress.mock.calls).toHaveLength(2);
  });

  it('B63: rejects a v2 job when progress appears after version selection', async () => {
    const f = fixture();
    const progress = {
      hasOwnedProgress: jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    };
    const service = new AccountExportService(
      f.store,
      f.users,
      { get: (key: string) => key === 'STUDY_COLLECTIONS_ENABLED' } as never,
      { hasOwnedCollections: jest.fn().mockResolvedValue(false) } as never,
      progress as never,
    );
    f.store.requestActive.mockImplementation((input) =>
      Promise.resolve({
        created: true,
        job: job({ formatVersion: input.formatVersion }),
      }),
    );
    await expect(service.request('user-1', now)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_EXPORT_LEGACY_JOB_ACTIVE' },
    });
    expect(f.store.requestActive.mock.calls).toContainEqual([
      expect.objectContaining({ formatVersion: 2 }),
    ]);
  });

  it('B63: fails closed when the post-upsert owner probe fails', async () => {
    const f = fixture();
    const error = new Error('private data read unavailable');
    const progress = {
      hasOwnedProgress: jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockRejectedValueOnce(error),
    };
    const service = new AccountExportService(
      f.store,
      f.users,
      { get: () => false } as never,
      { hasOwnedCollections: jest.fn().mockResolvedValue(false) } as never,
      progress as never,
    );
    f.store.requestActive.mockImplementation((input) =>
      Promise.resolve({
        created: true,
        job: job({ formatVersion: input.formatVersion }),
      }),
    );
    await expect(service.request('user-1', now)).rejects.toBe(error);
    expect(f.store.requestActive.mock.calls).toHaveLength(1);
  });

  it('B63: rejects an unsupported durable format instead of mislabelling it', async () => {
    const f = fixture();
    const service = new AccountExportService(
      f.store,
      f.users,
      { get: () => false } as never,
      { hasOwnedCollections: jest.fn().mockResolvedValue(false) } as never,
      { hasOwnedProgress: jest.fn().mockResolvedValue(false) } as never,
    );
    f.store.requestActive.mockResolvedValue({
      created: false,
      job: job({ formatVersion: 99 }),
    });
    await expect(service.request('user-1', now)).rejects.toThrow(
      'unsupported format version',
    );
  });

  it('B63: permits replay of a higher-version historical job, never downgrading it', async () => {
    const f = fixture();
    const service = new AccountExportService(
      f.store,
      f.users,
      { get: () => false } as never,
      { hasOwnedCollections: jest.fn().mockResolvedValue(false) } as never,
      { hasOwnedProgress: jest.fn().mockResolvedValue(false) } as never,
    );
    f.store.requestActive.mockResolvedValue({
      created: false,
      job: job({ formatVersion: 3 }),
    });
    const result = await service.request('user-1', now);
    expect(result.created).toBe(false);
    expect(result.export.formatVersion).toBe(3);
    expect(f.store.requestActive.mock.calls).toContainEqual([
      expect.objectContaining({ formatVersion: 1 }),
    ]);
  });

  it('requires v3 for existing study progress despite a rolled-back flag', async () => {
    const f = fixture();
    const config = { get: () => false };
    const collections = {
      hasOwnedCollections: jest.fn().mockResolvedValue(false),
    };
    const progress = { hasOwnedProgress: jest.fn().mockResolvedValue(true) };
    const service = new AccountExportService(
      f.store,
      f.users,
      config as never,
      collections as never,
      progress as never,
    );
    f.store.requestActive.mockImplementation((input) =>
      Promise.resolve({
        created: true,
        job: job({ formatVersion: input.formatVersion }),
      }),
    );
    expect((await service.request('user-1', now)).export.formatVersion).toBe(3);
    expect(progress.hasOwnedProgress.mock.calls).toContainEqual(['user-1']);
    expect(f.store.requestActive.mock.calls).toContainEqual([
      expect.objectContaining({ formatVersion: 3 }),
    ]);
  });

  it('rejects stale v1/v2 work for a newly required v3 export', async () => {
    const f = fixture();
    const service = new AccountExportService(
      f.store,
      f.users,
      {
        get: (key: string) => key === 'STUDY_PROGRESS_ENABLED',
      } as never,
      { hasOwnedCollections: jest.fn() } as never,
      { hasOwnedProgress: jest.fn() } as never,
    );
    for (const version of [1, 2]) {
      f.store.requestActive.mockResolvedValueOnce({
        created: false,
        job: job({ formatVersion: version }),
      });
      await expect(service.request('user-1', now)).rejects.toMatchObject({
        response: { code: 'ACCOUNT_EXPORT_LEGACY_JOB_ACTIVE' },
      });
    }
  });

  it('does not downgrade when progress existence check fails', async () => {
    const f = fixture();
    const failure = new Error('Mongo unavailable');
    const service = new AccountExportService(
      f.store,
      f.users,
      {
        get: () => false,
      } as never,
      { hasOwnedCollections: jest.fn() } as never,
      { hasOwnedProgress: jest.fn().mockRejectedValue(failure) } as never,
    );
    await expect(service.request('user-1', now)).rejects.toBe(failure);
    expect(f.store.requestActive.mock.calls).toHaveLength(0);
  });

  it('requests v2 when persistent collections are enabled', async () => {
    const f = fixture();
    const service = new AccountExportService(
      f.store,
      f.users,
      {
        get: (key: string) =>
          key === 'STUDY_COLLECTIONS_ENABLED' ? true : undefined,
      } as never,
      { hasOwnedCollections: jest.fn().mockResolvedValue(false) } as never,
      emptyProgressReader as never,
    );
    f.store.requestActive.mockImplementation((input) =>
      Promise.resolve({
        created: true,
        job: job({
          id: input.id,
          userId: input.userId,
          formatVersion: input.formatVersion,
        }),
      }),
    );
    const output = await service.request('user-1', now);
    expect(output.export.formatVersion).toBe(2);
    expect(f.store.requestActive.mock.calls).toContainEqual([
      expect.objectContaining({
        formatVersion: 2,
      }),
    ]);
  });

  it('does not reuse a pre-activation v1 job for newly persisted private collections', async () => {
    const f = fixture();
    const service = new AccountExportService(
      f.store,
      f.users,
      {
        get: (key: string) =>
          key === 'STUDY_COLLECTIONS_ENABLED' ? true : undefined,
      } as never,
      { hasOwnedCollections: jest.fn().mockResolvedValue(false) } as never,
      emptyProgressReader as never,
    );
    f.store.requestActive.mockResolvedValue({
      created: false,
      job: job({ formatVersion: 1 }),
    });
    await expect(service.request('user-1', now)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  describe('B49 rollback-safe account portability', () => {
    const disabled = {
      get: (key: string) =>
        key === 'STUDY_COLLECTIONS_ENABLED' ? false : undefined,
    };

    function reader(owned: boolean) {
      return {
        hasOwnedCollections: jest.fn().mockResolvedValue(owned),
      };
    }

    it('requests a complete v2 export if owned collections survived a disabled feature flag', async () => {
      const f = fixture();
      const ownedReader = reader(true);
      const service = new AccountExportService(
        f.store,
        f.users,
        disabled as never,
        ownedReader as never,
        emptyProgressReader as never,
      );
      f.store.requestActive.mockImplementation((input) =>
        Promise.resolve({
          created: true,
          job: job({
            id: input.id,
            userId: input.userId,
            formatVersion: input.formatVersion,
          }),
        }),
      );
      const result = await service.request('user-1', now);
      expect(result.export.formatVersion).toBe(2);
      expect(f.store.requestActive.mock.calls).toContainEqual([
        expect.objectContaining({ userId: 'user-1', formatVersion: 2 }),
      ]);
      expect(ownedReader.hasOwnedCollections.mock.calls).toContainEqual([
        'user-1',
      ]);
    });

    it("keeps v1 only if the owner's private collection set is empty", async () => {
      const f = fixture();
      const emptyReader = reader(false);
      const service = new AccountExportService(
        f.store,
        f.users,
        disabled as never,
        emptyReader as never,
        emptyProgressReader as never,
      );
      f.store.requestActive.mockImplementation((input) =>
        Promise.resolve({
          created: true,
          job: job({ formatVersion: input.formatVersion }),
        }),
      );
      const result = await service.request('user-1', now);
      expect(result.export.formatVersion).toBe(1);
      expect(emptyReader.hasOwnedCollections.mock.calls).toContainEqual([
        'user-1',
      ]);
    });

    it('rejects a stale active v1 job if private collections require v2 during rollback', async () => {
      const f = fixture();
      const service = new AccountExportService(
        f.store,
        f.users,
        disabled as never,
        reader(true) as never,
        emptyProgressReader as never,
      );
      f.store.requestActive.mockResolvedValueOnce({
        created: false,
        job: job({ formatVersion: 1 }),
      });
      await expect(service.request('user-1', now)).rejects.toMatchObject({
        response: { code: 'ACCOUNT_EXPORT_LEGACY_JOB_ACTIVE' },
      });
      expect(f.store.requestActive.mock.calls).toContainEqual([
        expect.objectContaining({ formatVersion: 2 }),
      ]);
    });

    it('propagates Mongo failures instead of creating an incomplete v1 artifact', async () => {
      const f = fixture();
      const unavailable = reader(false);
      const error = new Error('Mongo read unavailable');
      unavailable.hasOwnedCollections.mockRejectedValueOnce(error);
      const service = new AccountExportService(
        f.store,
        f.users,
        disabled as never,
        unavailable as never,
        emptyProgressReader as never,
      );
      await expect(service.request('user-1', now)).rejects.toBe(error);
      expect(f.store.requestActive.mock.calls).toHaveLength(0);
    });

    it('fails closed on missing reader wiring whenever real configuration is present', async () => {
      const f = fixture();
      const service = new AccountExportService(
        f.store,
        f.users,
        disabled as never,
      );
      await expect(service.request('user-1', now)).rejects.toThrow(
        'export readers are not fully wired',
      );
      expect(f.store.requestActive.mock.calls).toHaveLength(0);
    });

    it('keeps opt-in v2 behavior and does not require an additional Mongo existence query', async () => {
      const f = fixture();
      const ownedReader = reader(false);
      const enabled = {
        get: (key: string) => key === 'STUDY_COLLECTIONS_ENABLED',
      };
      const service = new AccountExportService(
        f.store,
        f.users,
        enabled as never,
        ownedReader as never,
        emptyProgressReader as never,
      );
      f.store.requestActive.mockImplementation((input) =>
        Promise.resolve({
          created: true,
          job: job({ formatVersion: input.formatVersion }),
        }),
      );
      const result = await service.request('user-1', now);
      expect(result.export.formatVersion).toBe(2);
      expect(ownedReader.hasOwnedCollections.mock.calls).toHaveLength(0);
    });
  });
});
