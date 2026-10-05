import type { AccountExportStore } from './account-export.store';
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_FORMAT_VERSION,
  ACCOUNT_EXPORT_PAGE_LIMIT,
  type AccountExportContributor,
  type AccountExportJobRecord,
} from './account-export.types';
import { AccountExportService } from './account-export.service';

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
    reschedule: jest.fn(),
    hasFailed: jest.fn(),
  } as unknown as jest.Mocked<AccountExportStore>;

  return {
    store,
    service: new AccountExportService(store),
  };
}

describe('AccountExportService', () => {
  it(
    'creates one active export request and returns only public status fields',
    async () => {
    const f = fixture();
    f.store.requestActive.mockImplementation((input) =>
      Promise.resolve({
        created: true,
        job: job({ id: input.id, userId: input.userId }),
      }),
    );

    const result = await f.service.request('user-1', now);

    expect(result.created).toBe(true);
    expect(result.export).toEqual({
      id: expect.any(String),
      format: ACCOUNT_EXPORT_FORMAT,
      formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
      state: 'pending',
      requestedAt: now.toISOString(),
      failureCode: null,
    });
    expect(f.store.requestActive).toHaveBeenCalledWith({
      id: expect.any(String),
      userId: 'user-1',
      formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
      now,
    });
    expect(result.export).not.toHaveProperty('claimId');
      expect(result.export).not.toHaveProperty('leaseExpiresAt');
    },
  );

  it(
    'replays the existing active export instead of manufacturing another job',
    async () => {
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
      },
      });
    },
  );

  it('looks up status through the owner-scoped store boundary', async () => {
    const f = fixture();
    f.store.findOwned.mockResolvedValue(job({ state: 'processing' }));

    await expect(
      f.service.status('user-1', 'export-1'),
    ).resolves.toMatchObject({
      id: 'export-1',
      state: 'processing',
    });
    expect(f.store.findOwned).toHaveBeenCalledWith('export-1', 'user-1');

    f.store.findOwned.mockResolvedValue(null);
    await expect(
      f.service.status('other-user', 'export-1'),
    ).resolves.toBeNull();
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
