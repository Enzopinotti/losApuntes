import type { AccountExportArtifactSink } from './account-export-assembler';
import { AccountExportAssembler } from './account-export-assembler';
import {
  ACCOUNT_EXPORT_V1_SECTION_IDS,
  ACCOUNT_EXPORT_V2_SECTION_IDS,
  AccountExportContributorRegistry,
  accountExportSectionIds,
  assertAccountExportSections,
} from './account-export-contributor.registry';
import { AccountExportService } from './account-export.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
} from './account-export.types';

const OWNER = 'owner-sentinel';
const SECTION = 'study.collections';

function contributor(
  id: string,
  rows: AccountExportRecord[] = [],
): AccountExportContributor {
  return {
    sectionId: id,
    readPage: jest.fn().mockImplementation(
      async ({ userId, cursor, limit }: {
        userId: string;
        cursor: string | null;
        limit: number;
      }) => {
        if (userId !== OWNER || limit !== 100 || cursor !== null) {
          throw new Error('Export read exceeded owner/pagination boundary');
        }
        return { records: rows, nextCursor: null };
      },
    ),
  };
}

function mounted(v2: boolean) {
  const ids = v2
    ? ACCOUNT_EXPORT_V2_SECTION_IDS
    : ACCOUNT_EXPORT_V1_SECTION_IDS;
  const contributors = ids.map((id) =>
    contributor(
      id,
      id === SECTION
        ? [{
            id: '11111111-1111-4111-8111-111111111111',
            title: 'Primer parcial',
            resourceIds: ['22222222-2222-4222-8222-222222222222'],
          }]
        : [],
    ),
  );
  return { contributors, registry: new AccountExportContributorRegistry(contributors) };
}

function fixture(registry: AccountExportContributorRegistry) {
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
  const service = {
    readContributorPage: jest.fn().mockImplementation(
      (provider: AccountExportContributor, userId: string, cursor: string | null) =>
        provider.readPage({ userId, cursor, limit: 100 }),
    ),
    assertActiveAccount: jest.fn().mockResolvedValue(undefined),
  };
  const assembler = new AccountExportAssembler(
    registry,
    service as unknown as AccountExportService,
  );
  return { assembler, service, chunks, sink, commit, abort };
}

describe('Account export v2 compatibility — B45', () => {
  it('keeps the legacy thirty in their exact order and adds a single v2 section', () => {
    expect(ACCOUNT_EXPORT_V1_SECTION_IDS).toHaveLength(30);
    expect(ACCOUNT_EXPORT_V2_SECTION_IDS).toHaveLength(31);
    expect(ACCOUNT_EXPORT_V2_SECTION_IDS.filter(
      (id) => !ACCOUNT_EXPORT_V1_SECTION_IDS.includes(
        id as (typeof ACCOUNT_EXPORT_V1_SECTION_IDS)[number],
      ),
    )).toEqual([SECTION]);
    expect(accountExportSectionIds(1)).toEqual(ACCOUNT_EXPORT_V1_SECTION_IDS);
    expect(accountExportSectionIds(2)).toEqual(ACCOUNT_EXPORT_V2_SECTION_IDS);
    expect(() => accountExportSectionIds(3)).toThrow('Unsupported');
    expect(() => assertAccountExportSections(mounted(false).contributors, 1))
      .not.toThrow();
    expect(() => assertAccountExportSections(mounted(false).contributors, 2))
      .toThrow('inventory is incomplete');
    expect(() => assertAccountExportSections(mounted(true).contributors, 2))
      .not.toThrow();
    expect(() => assertAccountExportSections([
      ...mounted(true).contributors,
      contributor('unreviewed.private'),
    ], 2)).toThrow('inventory is incomplete');
  });

  it('assembles legacy v1 byte-shape even when v2 is mounted', async () => {
    const { assembler, chunks, sink, commit } = fixture(mounted(true).registry);
    const result = await assembler.writeJsonV1(OWNER, sink);
    const envelope = JSON.parse(chunks.join('')) as {
      version: number;
      sections: Record<string, unknown[]>;
    };
    expect(envelope.version).toBe(1);
    expect(Object.keys(envelope.sections)).toEqual(ACCOUNT_EXPORT_V1_SECTION_IDS);
    expect(envelope.sections).not.toHaveProperty(SECTION);
    expect(result.sectionCount).toBe(30);
    expect(result.formatVersion).toBe(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('assembles v2 owner-owned collections only after complete 31-section wiring', async () => {
    const { assembler, chunks, sink, service, commit } = fixture(mounted(true).registry);
    const result = await assembler.writeJsonV2(OWNER, sink);
    const envelope = JSON.parse(chunks.join('')) as {
      format: string;
      version: number;
      sections: Record<string, AccountExportRecord[]>;
    };
    expect(envelope.version).toBe(2);
    expect(Object.keys(envelope.sections)).toEqual(ACCOUNT_EXPORT_V2_SECTION_IDS);
    expect(envelope.sections[SECTION]).toEqual([{
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Primer parcial',
      resourceIds: ['22222222-2222-4222-8222-222222222222'],
    }]);
    expect(result.formatVersion).toBe(2);
    expect(result.sectionCount).toBe(31);
    expect(result.recordCount).toBe(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(service.assertActiveAccount).toHaveBeenCalledWith(OWNER);
    expect(service.readContributorPage).toHaveBeenCalledTimes(31);
  });

  it('does not publish v2 when its contributor is missing or the inventory is altered', async () => {
    const legacy = fixture(mounted(false).registry);
    await expect(legacy.assembler.writeJsonV2(OWNER, legacy.sink))
      .rejects.toThrow('Unknown account export section: study.collections');
    expect(legacy.commit).not.toHaveBeenCalled();
    const expanded = mounted(true).contributors;
    const invalid = fixture(new AccountExportContributorRegistry([
      ...expanded,
      contributor('unreviewed.private'),
    ]));
    await expect(invalid.assembler.writeJsonV2(OWNER, invalid.sink))
      .rejects.toThrow('inventory is incomplete');
    expect(invalid.commit).not.toHaveBeenCalled();
  });
});
