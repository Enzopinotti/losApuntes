import type { GoogleExternalIdentityStore } from './google.types';
import { GoogleIdentityAccountExportService } from './google-identity-account-export.service';

describe('GoogleIdentityAccountExportService', () => {
  it('delegates the exact owner to the account-export-only store projection', async () => {
    const identity = {
      provider: 'google' as const,
      providerSubject: 'google-subject-1',
      emailAtLink: 'linked-address@example.test',
      linkedAt: new Date('2026-10-10T12:30:00.000Z'),
    };
    const store = {
      findForAccountExport: jest.fn().mockResolvedValue(identity),
    } as unknown as jest.Mocked<GoogleExternalIdentityStore>;
    const service = new GoogleIdentityAccountExportService(store);

    await expect(service.getForAccountExport('owner-1')).resolves.toBe(
      identity,
    );
    expect(store.findForAccountExport.mock.calls).toEqual([['owner-1']]);
  });
});
