import { MODULE_METADATA } from '@nestjs/common/constants';

import { DataLifecycleModule } from './data-lifecycle.module';
import type { AccountExportArtifactSink } from './domain/account-export-assembler';
import { AccountExportAssembler } from './domain/account-export-assembler';
import {
  ACCOUNT_EXPORT_CONTRIBUTORS,
  AccountExportContributorRegistry,
  assertAccountExportV1Sections,
} from './domain/account-export-contributor.registry';
import { AccountExportService } from './domain/account-export.service';
import type { AccountExportContributor } from './domain/account-export.types';

type ContributorFactoryProvider = {
  provide: symbol;
  inject: (new (dependency: never) => AccountExportContributor)[];
  useFactory: (...contributors: AccountExportContributor[]) => unknown;
};

type DomainCall = { method: string; args: unknown[] };

const EXPECTED_V1_SECTION_IDS = [
  'academic.affiliations',
  'academic.currentContext',
  'academic.follows',
  'academic.proposals',
  'academic.subjectParticipations',
  'account',
  'auth.externalIdentities',
  'feeds.feedback',
  'feeds.preferences',
  'files.uploads',
  'notifications.inbox',
  'organizations.authoredEvents',
  'organizations.authoredLinks',
  'organizations.authoredPosts',
  'organizations.featuredResources',
  'organizations.following',
  'organizations.management',
  'organizations.submittedReports',
  'pilot.activity',
  'profile',
  'profile.activities',
  'qa.authoredAnswers',
  'qa.authoredQuestions',
  'qa.submittedReports',
  'resources.authored',
  'resources.saved',
  'resources.sharedGrants',
  'resources.submittedReports',
  'social.connections',
  'social.following',
] as const;

function contributorFactory(): ContributorFactoryProvider {
  const providers = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    DataLifecycleModule,
  ) as unknown[];
  const provider = providers.find(
    (candidate): candidate is ContributorFactoryProvider =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === ACCOUNT_EXPORT_CONTRIBUTORS,
  );

  if (!provider) {
    throw new Error('Account export contributor factory is not registered');
  }

  return provider;
}

function wiredContributors(dependency: unknown): AccountExportContributor[] {
  const provider = contributorFactory();
  const dependencies = provider.inject.map(
    (Contributor) => new Contributor(dependency as never),
  );

  return Reflect.apply(
    provider.useFactory,
    undefined,
    dependencies,
  ) as AccountExportContributor[];
}

describe('DataLifecycleModule account export wiring', () => {
  it('registers every documented v1 section through its real contributor factory', () => {
    const registry = new AccountExportContributorRegistry(
      wiredContributors({}),
    );

    expect(registry.list().map(({ sectionId }) => sectionId)).toEqual(
      EXPECTED_V1_SECTION_IDS,
    );
  });

  it('fails the real Nest factory before generating an incomplete v1 export', () => {
    const provider = contributorFactory();
    const dependencies = provider.inject.map(
      (Contributor) => new Contributor({} as never),
    );
    expect(dependencies).toHaveLength(EXPECTED_V1_SECTION_IDS.length);

    const missing = dependencies.filter(
      (contributor) => contributor.sectionId !== 'qa.submittedReports',
    );
    expect(() => assertAccountExportV1Sections(missing)).toThrow(
      'inventory is incomplete or incompatible',
    );
    expect(() =>
      assertAccountExportV1Sections([
        ...dependencies,
        {
          sectionId: 'private.unreviewed',
          readPage: () =>
            Promise.resolve({
              records: [],
              nextCursor: null,
            }),
        },
      ]),
    ).toThrow('inventory is incomplete or incompatible');
    expect(() =>
      assertAccountExportV1Sections([
        ...dependencies.slice(0, -1),
        dependencies[0]!,
      ]),
    ).toThrow('inventory is incomplete or incompatible');
    expect(() => assertAccountExportV1Sections(dependencies)).not.toThrow();
  });

  it('assembles every section with the exact owner and bounded page budget', async () => {
    const ownerId = 'owner-sentinel';
    const domainCalls: DomainCall[] = [];
    const domainServices = new Proxy(
      {},
      {
        get: (_target, property) => {
          if (typeof property !== 'string') return undefined;

          return (...args: unknown[]) => {
            domainCalls.push({ method: property, args });

            if (property === 'getAccountExportProjection') {
              return Promise.resolve({
                id: ownerId,
                email: 'owner@example.test',
                username: 'owner',
                emailVerifiedAt: null,
                accountStatus: 'active',
                accountClosedAt: null,
                fullName: null,
                avatarUrl: null,
                bio: null,
                careerId: null,
                cohortYear: null,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              });
            }

            if (property.startsWith('get') || property.startsWith('find')) {
              return Promise.resolve(null);
            }

            return Promise.resolve({ items: [], nextCursor: null });
          };
        },
      },
    );
    const registry = new AccountExportContributorRegistry(
      wiredContributors(domainServices),
    );
    const hasActiveAccount = jest.fn().mockResolvedValue(true);
    const assembler = new AccountExportAssembler(
      registry,
      new AccountExportService({} as never, { hasActiveAccount } as never),
    );
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

    const result = await assembler.writeJsonV1(ownerId, sink);
    const envelope = JSON.parse(chunks.join('')) as {
      format: string;
      version: number;
      sections: Record<string, unknown[]>;
    };

    expect(result.sectionCount).toBe(EXPECTED_V1_SECTION_IDS.length);
    expect(result.recordCount).toBe(1);
    expect(envelope.format).toBe('los-apuntes-account-export');
    expect(envelope.version).toBe(1);
    expect(Object.keys(envelope.sections)).toEqual(EXPECTED_V1_SECTION_IDS);
    expect(envelope.sections.account).toHaveLength(1);
    expect(domainCalls).toHaveLength(EXPECTED_V1_SECTION_IDS.length);

    for (const call of domainCalls) {
      const ownerArgument =
        call.method === 'listForAccountExport'
          ? (call.args[0] as { userId: string }).userId
          : call.args[0];
      expect(ownerArgument).toBe(ownerId);

      if (call.method.startsWith('list')) {
        const pageInput = call.args.length === 1 ? call.args[0] : call.args[1];
        expect(pageInput).toMatchObject({ cursor: null, limit: 100 });
      }
    }

    expect(hasActiveAccount).toHaveBeenCalledWith(ownerId);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(abort).not.toHaveBeenCalled();
  });
});
