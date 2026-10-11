import { Inject, Injectable } from '@nestjs/common';

import {
  GOOGLE_EXTERNAL_IDENTITY_STORE,
  type GoogleExternalIdentityAccountExportRecord,
  type GoogleExternalIdentityStore,
} from './google.types';

@Injectable()
export class GoogleIdentityAccountExportService {
  constructor(
    @Inject(GOOGLE_EXTERNAL_IDENTITY_STORE)
    private readonly store: GoogleExternalIdentityStore,
  ) {}

  getForAccountExport(
    userId: string,
  ): Promise<GoogleExternalIdentityAccountExportRecord | null> {
    return this.store.findForAccountExport(userId);
  }
}
