import { Inject, Injectable } from '@nestjs/common';

import type { AccountExportContributor } from './account-export.types';

export const ACCOUNT_EXPORT_CONTRIBUTORS = Symbol(
  'ACCOUNT_EXPORT_CONTRIBUTORS',
);

/**
 * Public v1 is a fixed, portable 30-section contract. Check the real Nest
 * contributor factory in production, not every partial fixture Registry.
 * A wiring regression must not publish a seemingly successful incomplete
 * export even when isolated contributor unit tests are not run.
 */
export const ACCOUNT_EXPORT_V1_SECTION_IDS = Object.freeze([
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
] as const);

/**
 * Draft v2 adds only the owner's private study collections. The v1 manifest
 * remains immutable. Merely defining this manifest NEVER enables a v2 job:
 * the real contributor and a versioned module wiring gate must be integrated
 * before ACCOUNT_EXPORT_FORMAT_VERSION can be raised from 1.
 */
export const ACCOUNT_EXPORT_V2_SECTION_IDS = Object.freeze(
  [...ACCOUNT_EXPORT_V1_SECTION_IDS, 'study.collections'].sort(),
);

/** v3 adds only private study progress; v1/v2 manifests remain immutable. */
export const ACCOUNT_EXPORT_V3_SECTION_IDS = Object.freeze(
  [...ACCOUNT_EXPORT_V2_SECTION_IDS, 'study.progress'].sort(),
);

/** No fallback: every persisted job must use its originally assigned version. */
export function accountExportSectionIds(version: number): readonly string[] {
  if (version === 1) return ACCOUNT_EXPORT_V1_SECTION_IDS;
  if (version === 2) return ACCOUNT_EXPORT_V2_SECTION_IDS;
  if (version === 3) return ACCOUNT_EXPORT_V3_SECTION_IDS;
  throw new Error('Unsupported account export format version');
}

export function assertAccountExportSections(
  contributors: readonly AccountExportContributor[],
  version: number,
): void {
  const actual = contributors.map(({ sectionId }) => sectionId).sort();
  const expected = accountExportSectionIds(version);
  if (
    actual.length !== expected.length ||
    actual.some((sectionId, index) => sectionId !== expected[index])
  ) {
    throw new Error(
      `Account export v${version} contributor inventory is incomplete or incompatible`,
    );
  }
}

/** Fail closed at actual module wiring if v1 sections are missing or altered. */
export function assertAccountExportV1Sections(
  contributors: readonly AccountExportContributor[],
): void {
  assertAccountExportSections(contributors, 1);
}

@Injectable()
export class AccountExportContributorRegistry {
  private readonly contributors: readonly AccountExportContributor[];
  private readonly bySection: ReadonlyMap<string, AccountExportContributor>;

  constructor(
    @Inject(ACCOUNT_EXPORT_CONTRIBUTORS)
    contributors: readonly AccountExportContributor[],
  ) {
    const bySection = new Map<string, AccountExportContributor>();

    for (const contributor of contributors) {
      const sectionId = contributor.sectionId.trim();
      if (!sectionId) {
        throw new Error('Account export contributor sectionId is required');
      }
      if (sectionId !== contributor.sectionId) {
        throw new Error(
          'Account export contributor sectionId must not have surrounding whitespace',
        );
      }
      if (bySection.has(sectionId)) {
        throw new Error(
          `Duplicate account export contributor sectionId: ${sectionId}`,
        );
      }
      bySection.set(sectionId, contributor);
    }

    this.contributors = [...bySection.values()].sort((left, right) =>
      left.sectionId.localeCompare(right.sectionId),
    );
    this.bySection = bySection;
  }

  list(): readonly AccountExportContributor[] {
    return this.contributors;
  }

  require(sectionId: string): AccountExportContributor {
    const contributor = this.bySection.get(sectionId);
    if (!contributor) {
      throw new Error(`Unknown account export section: ${sectionId}`);
    }
    return contributor;
  }
}
