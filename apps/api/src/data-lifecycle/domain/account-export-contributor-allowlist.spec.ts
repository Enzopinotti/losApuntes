import { AccountExportAssembler } from './account-export-assembler';
import type { AccountExportArtifactSink } from './account-export-assembler';
import {
  AccountExportContributorRegistry,
  accountExportSectionIds,
} from './account-export-contributor.registry';
import type { AccountExportService } from './account-export.service';
import type { AccountExportContributor } from './account-export.types';

const OWNER = 'owner-sentinel';

function fixture(registeredSections: readonly string[]) {
  const providers: AccountExportContributor[] = registeredSections.map(
    (sectionId) => ({
      sectionId,
      readPage: jest.fn().mockResolvedValue({
        records: [],
        nextCursor: null,
      }),
    }),
  );
  const readContributorPage = jest
    .fn()
    .mockImplementation(
      (
        contributor: AccountExportContributor,
        userId: string,
        cursor: string | null,
      ) => contributor.readPage({ userId, cursor, limit: 100 }),
    );
  const captureStudyProgressExportEpoch = jest.fn().mockResolvedValue(0);
  const assertStudyProgressExportEpoch = jest.fn().mockResolvedValue(undefined);
  const service = {
    readContributorPage,
    assertActiveAccount: jest.fn().mockResolvedValue(undefined),
    captureStudyProgressExportEpoch,
    assertStudyProgressExportEpoch,
  } as unknown as AccountExportService;
  const chunks: string[] = [];
  const commit = jest.fn().mockResolvedValue(undefined);
  const abort = jest.fn().mockResolvedValue(undefined);
  const sink: AccountExportArtifactSink = {
    write: (chunk) => {
      chunks.push(chunk);
      return Promise.resolve();
    },
    commit,
    abort,
  };
  const assembler = new AccountExportAssembler(
    new AccountExportContributorRegistry(providers),
    service,
  );
  return {
    assembler,
    sink,
    chunks,
    commit,
    abort,
    readContributorPage,
    captureStudyProgressExportEpoch,
  };
}

describe('B76 versioned contributor inventory allowlist', () => {
  it.each([1, 2, 3] as const)(
    'fails closed for unreviewed private sections before any v%s write',
    async (version) => {
      const f = fixture([
        ...accountExportSectionIds(version),
        'unreviewed.private',
      ]);
      const writing =
        version === 1
          ? f.assembler.writeJsonV1(OWNER, f.sink)
          : version === 2
            ? f.assembler.writeJsonV2(OWNER, f.sink)
            : f.assembler.writeJsonV3(OWNER, f.sink);

      await expect(writing).rejects.toThrow(
        `Account export v${version} contributor inventory is incomplete or incompatible`,
      );
      expect(f.chunks).toEqual([]);
      expect(f.readContributorPage).not.toHaveBeenCalled();
      expect(f.captureStudyProgressExportEpoch).not.toHaveBeenCalled();
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.abort).not.toHaveBeenCalled();
    },
  );

  it.each([1, 2] as const)(
    'keeps a persisted v%s artifact version-stable on the v3 registry',
    async (version) => {
      const f = fixture(accountExportSectionIds(3));
      const result =
        version === 1
          ? await f.assembler.writeJsonV1(OWNER, f.sink)
          : await f.assembler.writeJsonV2(OWNER, f.sink);
      const envelope = JSON.parse(f.chunks.join('')) as {
        version: number;
        sections: Record<string, unknown[]>;
      };
      expect(envelope.version).toBe(version);
      expect(Object.keys(envelope.sections)).toEqual(
        accountExportSectionIds(version),
      );
      expect(result.sectionCount).toBe(accountExportSectionIds(version).length);
      expect(f.readContributorPage).toHaveBeenCalledTimes(result.sectionCount);
      expect(f.captureStudyProgressExportEpoch).not.toHaveBeenCalled();
      expect(f.commit).toHaveBeenCalledTimes(1);
      expect(f.abort).not.toHaveBeenCalled();
    },
  );
});
