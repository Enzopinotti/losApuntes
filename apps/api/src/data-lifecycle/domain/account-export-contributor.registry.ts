import { Inject, Injectable } from '@nestjs/common';

import type { AccountExportContributor } from './account-export.types';

export const ACCOUNT_EXPORT_CONTRIBUTORS = Symbol(
  'ACCOUNT_EXPORT_CONTRIBUTORS',
);

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
