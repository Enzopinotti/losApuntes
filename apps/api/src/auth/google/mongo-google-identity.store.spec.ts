import type { Model } from 'mongoose';

import type { GoogleExternalIdentityAccountExportRecord } from './google.types';
import type { GoogleExternalIdentityDocument } from './schemas/google-external-identity.schema';
import { MongoGoogleExternalIdentityStore } from './mongo-google-identity.store';

describe('MongoGoogleExternalIdentityStore account export', () => {
  it('uses the exact provider/owner pair and a query-time portable allowlist', async () => {
    const result: GoogleExternalIdentityAccountExportRecord = {
      provider: 'google',
      providerSubject: 'google-subject-1',
      emailAtLink: 'linked-address@example.test',
      linkedAt: new Date('2026-10-10T12:30:00.000Z'),
    };
    const select = jest.fn().mockReturnThis();
    const lean = jest.fn().mockReturnThis();
    const exec = jest.fn().mockResolvedValue(result);
    const query = {
      select,
      lean,
      exec,
    };
    const findOne = jest.fn(() => query);
    const model = {
      findOne,
    } as unknown as Model<GoogleExternalIdentityDocument>;
    const store = new MongoGoogleExternalIdentityStore(model);

    await expect(store.findForAccountExport('owner-1')).resolves.toBe(result);

    expect(findOne.mock.calls).toEqual([
      [
        {
          provider: 'google',
          userId: 'owner-1',
        },
      ],
    ]);
    expect(select.mock.calls).toEqual([
      [
        {
          _id: 0,
          provider: 1,
          providerSubject: 1,
          emailAtLink: 1,
          linkedAt: 1,
        },
      ],
    ]);
    expect(lean.mock.calls).toHaveLength(1);
    expect(findOne.mock.calls).toHaveLength(1);
    expect(exec.mock.calls).toHaveLength(1);
  });
});
