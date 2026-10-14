import type { GoogleIdentityAccountExportService } from '../../auth/google/google-identity-account-export.service';
import { GoogleExternalIdentitiesExportContributor } from './account-export-google-identities.contributors';

describe('Google external identities account export contributor', () => {
  it("exports only the current owner's linked identity metadata", async () => {
    const linkedAt = new Date('2026-10-10T12:30:00.000Z');
    const identities = {
      getForAccountExport: jest.fn().mockResolvedValue({
        provider: 'google',
        providerSubject: 'google-subject-1',
        emailAtLink: 'linked-address@example.test',
        linkedAt,
      }),
    } as unknown as jest.Mocked<GoogleIdentityAccountExportService>;

    const page = await new GoogleExternalIdentitiesExportContributor(
      identities,
    ).readPage({ userId: 'owner-1', cursor: null, limit: 100 });

    expect(identities.getForAccountExport.mock.calls).toEqual([['owner-1']]);
    expect(page).toEqual({
      records: [
        {
          provider: 'google',
          providerSubject: 'google-subject-1',
          emailAtLink: 'linked-address@example.test',
          linkedAt: linkedAt.toISOString(),
        },
      ],
      nextCursor: null,
    });
    for (const key of [
      'userId',
      '_id',
      'accessToken',
      'refreshToken',
      'idToken',
      'currentEmail',
    ]) {
      expect(page.records[0]).not.toHaveProperty(key);
    }
  });

  it('returns an empty section when the owner has no linked Google identity', async () => {
    const identities = {
      getForAccountExport: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<GoogleIdentityAccountExportService>;

    await expect(
      new GoogleExternalIdentitiesExportContributor(identities).readPage({
        userId: 'owner-1',
        cursor: null,
        limit: 100,
      }),
    ).resolves.toEqual({ records: [], nextCursor: null });
  });

  it('rejects continuation cursors for the singleton identity section', async () => {
    const identities = {
      getForAccountExport: jest.fn(),
    } as unknown as jest.Mocked<GoogleIdentityAccountExportService>;

    await expect(
      new GoogleExternalIdentitiesExportContributor(identities).readPage({
        userId: 'owner-1',
        cursor: 'opaque',
        limit: 100,
      }),
    ).rejects.toThrow(
      'Account export section auth.externalIdentities does not accept a cursor',
    );
    expect(identities.getForAccountExport.mock.calls).toHaveLength(0);
  });
});
