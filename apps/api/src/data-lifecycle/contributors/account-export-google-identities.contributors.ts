import { Injectable } from '@nestjs/common';

import { GoogleIdentityAccountExportService } from '../../auth/google/google-identity-account-export.service';
import type {
  AccountExportContributor,
  AccountExportRecord,
  AccountExportSectionPage,
} from '../domain/account-export.types';

@Injectable()
export class GoogleExternalIdentitiesExportContributor implements AccountExportContributor {
  readonly sectionId = 'auth.externalIdentities';

  constructor(
    private readonly identities: GoogleIdentityAccountExportService,
  ) {}

  async readPage(input: {
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<AccountExportSectionPage> {
    if (input.cursor !== null) {
      throw new Error(
        'Account export section auth.externalIdentities does not accept a cursor',
      );
    }

    const identity = await this.identities.getForAccountExport(input.userId);
    return {
      records: identity
        ? [
            {
              provider: identity.provider,
              providerSubject: identity.providerSubject,
              emailAtLink: identity.emailAtLink,
              linkedAt: identity.linkedAt.toISOString(),
            } satisfies AccountExportRecord,
          ]
        : [],
      nextCursor: null,
    };
  }
}
