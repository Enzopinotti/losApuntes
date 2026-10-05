import type { AccountExportContributor } from './account-export.types';
import { AccountExportContributorRegistry } from './account-export-contributor.registry';

function contributor(sectionId: string): AccountExportContributor {
  return {
    sectionId,
    readPage: jest.fn().mockResolvedValue({
      records: [],
      nextCursor: null,
    }),
  };
}

describe('AccountExportContributorRegistry', () => {
  it('exposes contributors in deterministic section order', () => {
    const registry = new AccountExportContributorRegistry([
      contributor('profile.activities'),
      contributor('account'),
      contributor('profile'),
    ]);

    expect(registry.list().map((item) => item.sectionId)).toEqual([
      'account',
      'profile',
      'profile.activities',
    ]);
    expect(registry.require('profile').sectionId).toBe('profile');
  });

  it('rejects blank and duplicate section identifiers', () => {
    expect(
      () => new AccountExportContributorRegistry([contributor('   ')]),
    ).toThrow('sectionId is required');

    expect(
      () =>
        new AccountExportContributorRegistry([
          contributor('profile'),
          contributor('profile'),
        ]),
    ).toThrow('Duplicate account export contributor sectionId: profile');

    expect(
      () => new AccountExportContributorRegistry([contributor(' profile')]),
    ).toThrow('sectionId must not have surrounding whitespace');
  });

  it('rejects unknown sections instead of falling back to another contributor', () => {
    const registry = new AccountExportContributorRegistry([
      contributor('account'),
    ]);

    expect(() => registry.require('unknown')).toThrow(
      'Unknown account export section: unknown',
    );
  });
});
