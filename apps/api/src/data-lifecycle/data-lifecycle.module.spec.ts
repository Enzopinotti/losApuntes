import { MODULE_METADATA } from '@nestjs/common/constants';

import { DataLifecycleModule } from './data-lifecycle.module';
import {
  ACCOUNT_EXPORT_CONTRIBUTORS,
  AccountExportContributorRegistry,
} from './domain/account-export-contributor.registry';
import type { AccountExportContributor } from './domain/account-export.types';

type ContributorFactoryProvider = {
  provide: symbol;
  inject: (new (dependency: never) => AccountExportContributor)[];
  useFactory: (...contributors: AccountExportContributor[]) => unknown;
};

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

describe('DataLifecycleModule account export wiring', () => {
  it('registers every documented v1 section through its real contributor factory', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      DataLifecycleModule,
    ) as unknown[];
    const contributorProvider = providers.find(
      (provider): provider is ContributorFactoryProvider =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === ACCOUNT_EXPORT_CONTRIBUTORS,
    );

    expect(contributorProvider).toBeDefined();
    if (!contributorProvider) {
      throw new Error('Account export contributor factory is not registered');
    }

    const dependencies = contributorProvider.inject.map(
      (providerToken) => new providerToken({} as never),
    );
    const contributors = Reflect.apply(
      contributorProvider.useFactory,
      undefined,
      dependencies,
    ) as AccountExportContributor[];
    const registry = new AccountExportContributorRegistry(contributors);

    expect(registry.list().map(({ sectionId }) => sectionId)).toEqual(
      EXPECTED_V1_SECTION_IDS,
    );
  });
});
