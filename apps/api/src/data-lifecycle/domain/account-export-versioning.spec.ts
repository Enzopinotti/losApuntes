import type { AccountExportArtifactSink } from './account-export-assembler';
import { AccountExportAssembler } from './account-export-assembler';
import {
  ACCOUNT_EXPORT_V1_SECTION_IDS,
  ACCOUNT_EXPORT_V2_SECTION_IDS,
  ACCOUNT_EXPORT_V3_SECTION_IDS,
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
    readPage: jest
      .fn()
      .mockImplementation(
        ({
          userId,
          cursor,
          limit,
        }: {
          userId: string;
          cursor: string | null;
          limit: number;
        }) => {
          if (userId !== OWNER || limit !== 100 || cursor !== null) {
            return Promise.reject(
              new Error('Export read exceeded owner/pagination boundary'),
            );
          }
          return Promise.resolve({ records: rows, nextCursor: null });
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
        ? [
            {
              id: '11111111-1111-4111-8111-111111111111',
              title: 'Primer parcial',
              resourceIds: ['22222222-2222-4222-8222-222222222222'],
            },
          ]
        : [],
    ),
  );
  return {
    contributors,
    registry: new AccountExportContributorRegistry(contributors),
  };
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
    readContributorPage: jest
      .fn()
      .mockImplementation(
        (
          provider: AccountExportContributor,
          userId: string,
          cursor: string | null,
        ) => provider.readPage({ userId, cursor, limit: 100 }),
      ),
    assertActiveAccount: jest.fn().mockResolvedValue(undefined),
    captureStudyProgressExportEpoch: jest.fn().mockResolvedValue(0),
    assertStudyProgressExportEpoch: jest.fn().mockResolvedValue(undefined),
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
    expect(
      ACCOUNT_EXPORT_V2_SECTION_IDS.filter(
        (id) =>
          !ACCOUNT_EXPORT_V1_SECTION_IDS.includes(
            id as (typeof ACCOUNT_EXPORT_V1_SECTION_IDS)[number],
          ),
      ),
    ).toEqual([SECTION]);
    expect(accountExportSectionIds(1)).toEqual(ACCOUNT_EXPORT_V1_SECTION_IDS);
    expect(accountExportSectionIds(2)).toEqual(ACCOUNT_EXPORT_V2_SECTION_IDS);
    expect(accountExportSectionIds(3)).toEqual(ACCOUNT_EXPORT_V3_SECTION_IDS);
    expect(ACCOUNT_EXPORT_V3_SECTION_IDS).toHaveLength(32);
    expect(() => accountExportSectionIds(4)).toThrow('Unsupported');
    expect(() =>
      assertAccountExportSections(mounted(false).contributors, 1),
    ).not.toThrow();
    expect(() =>
      assertAccountExportSections(mounted(false).contributors, 2),
    ).toThrow('inventory is incomplete');
    expect(() =>
      assertAccountExportSections(mounted(true).contributors, 2),
    ).not.toThrow();
    expect(() =>
      assertAccountExportSections(mounted(true).contributors, 3),
    ).toThrow('inventory is incomplete');
    expect(() =>
      assertAccountExportSections(
        [...mounted(true).contributors, contributor('unreviewed.private')],
        2,
      ),
    ).toThrow('inventory is incomplete');
  });

  it('assembles legacy v1 byte-shape even when v2 is mounted', async () => {
    const { assembler, chunks, sink, commit } = fixture(mounted(true).registry);
    const result = await assembler.writeJsonV1(OWNER, sink);
    const envelope = JSON.parse(chunks.join('')) as {
      version: number;
      sections: Record<string, unknown[]>;
    };
    expect(envelope.version).toBe(1);
    expect(Object.keys(envelope.sections)).toEqual(
      ACCOUNT_EXPORT_V1_SECTION_IDS,
    );
    expect(envelope.sections).not.toHaveProperty(SECTION);
    expect(result.sectionCount).toBe(30);
    expect(result.formatVersion).toBe(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('assembles v2 owner-owned collections only after complete 31-section wiring', async () => {
    const { assembler, chunks, sink, service, commit } = fixture(
      mounted(true).registry,
    );
    const result = await assembler.writeJsonV2(OWNER, sink);
    const envelope = JSON.parse(chunks.join('')) as {
      format: string;
      version: number;
      sections: Record<string, AccountExportRecord[]>;
    };
    expect(envelope.version).toBe(2);
    expect(Object.keys(envelope.sections)).toEqual(
      ACCOUNT_EXPORT_V2_SECTION_IDS,
    );
    expect(envelope.sections[SECTION]).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Primer parcial',
        resourceIds: ['22222222-2222-4222-8222-222222222222'],
      },
    ]);
    expect(result.formatVersion).toBe(2);
    expect(result.sectionCount).toBe(31);
    expect(result.recordCount).toBe(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(service.assertActiveAccount).toHaveBeenCalledWith(OWNER);
    expect(service.readContributorPage).toHaveBeenCalledTimes(31);
  });

  it('writes the exact 32-section v3 while preserving legacy assembly', async () => {
    const all = ACCOUNT_EXPORT_V3_SECTION_IDS.map((sectionId) =>
      contributor(
        sectionId,
        sectionId === 'study.progress'
          ? [
              {
                subjectId: '11111111-1111-4111-8111-111111111111',
                plan: {
                  format: 'losapuntes.study-session',
                  version: 1,
                  subjectId: '11111111-1111-4111-8111-111111111111',
                  title: 'Estudio',
                  notes: '',
                  startsAt: null,
                  tasks: [],
                },
                revision: 1,
                createdAt: '2026-10-15T12:00:00.000Z',
                updatedAt: '2026-10-15T12:00:00.000Z',
              },
            ]
          : [],
      ),
    );
    const mountedV3 = new AccountExportContributorRegistry(all);
    const v3 = fixture(mountedV3);
    const assembled = await v3.assembler.writeJsonV3(OWNER, v3.sink);
    const json = JSON.parse(v3.chunks.join('')) as {
      version: number;
      sections: Record<string, unknown[]>;
    };
    expect(json.version).toBe(3);
    expect(Object.keys(json.sections)).toEqual(ACCOUNT_EXPORT_V3_SECTION_IDS);
    expect(json.sections['study.progress']).toHaveLength(1);
    expect(assembled.sectionCount).toBe(32);
    expect(assembled.recordCount).toBe(1);
    expect(v3.commit).toHaveBeenCalledTimes(1);

    for (const [version, expectedIds] of [
      [1, ACCOUNT_EXPORT_V1_SECTION_IDS],
      [2, ACCOUNT_EXPORT_V2_SECTION_IDS],
    ] as const) {
      const legacy = fixture(mountedV3);
      if (version === 1) {
        await legacy.assembler.writeJsonV1(OWNER, legacy.sink);
      } else {
        await legacy.assembler.writeJsonV2(OWNER, legacy.sink);
      }
      const payload = JSON.parse(legacy.chunks.join('')) as {
        version: number;
        sections: Record<string, unknown[]>;
      };
      expect(payload.version).toBe(version);
      expect(Object.keys(payload.sections)).toEqual(expectedIds);
      expect(payload.sections).not.toHaveProperty('study.progress');
    }
  });

  it('B64: aborts v3 if owner progress changes while streaming', async () => {
    const all = ACCOUNT_EXPORT_V3_SECTION_IDS.map((sectionId) =>
      contributor(sectionId),
    );
    const f = fixture(new AccountExportContributorRegistry(all));
    f.service.captureStudyProgressExportEpoch.mockResolvedValue(7);
    f.service.assertStudyProgressExportEpoch.mockRejectedValue(
      new Error('Study progress changed during account export'),
    );
    await expect(f.assembler.writeJsonV3(OWNER, f.sink)).rejects.toThrow(
      'Study progress changed during account export',
    );
    expect(f.service.captureStudyProgressExportEpoch).toHaveBeenCalledWith(
      OWNER,
    );
    expect(f.service.assertStudyProgressExportEpoch).toHaveBeenCalledWith(
      OWNER,
      7,
    );
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.abort).toHaveBeenCalledTimes(1);
  });

  it('B64: exports a stable v3 revision and checks before artifact commit', async () => {
    const all = ACCOUNT_EXPORT_V3_SECTION_IDS.map((sectionId) =>
      contributor(sectionId),
    );
    const f = fixture(new AccountExportContributorRegistry(all));
    const order: string[] = [];
    f.service.captureStudyProgressExportEpoch.mockResolvedValue(9);
    f.service.assertStudyProgressExportEpoch.mockImplementation(
      (userId: string, expected: number) => {
        expect(userId).toBe(OWNER);
        expect(expected).toBe(9);
        order.push('recheck');
        return Promise.resolve();
      },
    );
    f.sink.commit = jest.fn().mockImplementation(() => {
      order.push('commit');
      return Promise.resolve();
    });
    await f.assembler.writeJsonV3(OWNER, f.sink);
    expect(order).toEqual(['recheck', 'commit']);
  });

  it('B64: never probes new private epochs for legacy v1/v2 jobs', async () => {
    const all = ACCOUNT_EXPORT_V3_SECTION_IDS.map((sectionId) =>
      contributor(sectionId),
    );
    for (const version of [1, 2] as const) {
      const f = fixture(new AccountExportContributorRegistry(all));
      if (version === 1) await f.assembler.writeJsonV1(OWNER, f.sink);
      else await f.assembler.writeJsonV2(OWNER, f.sink);
      expect(f.service.captureStudyProgressExportEpoch).not.toHaveBeenCalled();
      expect(f.service.assertStudyProgressExportEpoch).not.toHaveBeenCalled();
      expect(f.commit).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects v3 without study progress contributor before committing', async () => {
    const old = fixture(mounted(true).registry);
    await expect(old.assembler.writeJsonV3(OWNER, old.sink)).rejects.toThrow(
      'Unknown account export section: study.progress',
    );
    expect(old.commit).not.toHaveBeenCalled();
  });

  it('does not publish v2 when its contributor is missing or the inventory is altered', async () => {
    const legacy = fixture(mounted(false).registry);
    await expect(
      legacy.assembler.writeJsonV2(OWNER, legacy.sink),
    ).rejects.toThrow('Unknown account export section: study.collections');
    expect(legacy.commit).not.toHaveBeenCalled();
    // A persisted v2 job must never silently succeed with an unknown
    // registered private data source. Known v3 contributors remain
    // compatible (verified above), but a novel contributor requires review.
    const expanded = mounted(true).contributors;
    const incompatible = fixture(
      new AccountExportContributorRegistry([
        ...expanded,
        contributor('unreviewed.private'),
      ]),
    );
    await expect(
      incompatible.assembler.writeJsonV2(OWNER, incompatible.sink),
    ).rejects.toThrow(
      'Account export v2 contributor inventory is incomplete or incompatible',
    );
    expect(incompatible.chunks).toHaveLength(0);
    expect(incompatible.service.readContributorPage).not.toHaveBeenCalled();
    expect(
      incompatible.service.captureStudyProgressExportEpoch,
    ).not.toHaveBeenCalled();
    expect(incompatible.commit).not.toHaveBeenCalled();
  });
});
