import { Inject, Injectable } from '@nestjs/common';

import {
  GOOGLE_EXTERNAL_IDENTITY_STORE,
  type GoogleExternalIdentityStore,
  type GoogleIdentityLinkResult,
} from './google.types';

@Injectable()
export class GoogleIdentityService {
  constructor(
    @Inject(GOOGLE_EXTERNAL_IDENTITY_STORE)
    private readonly store: GoogleExternalIdentityStore,
  ) {}

  findBySubject(providerSubject: string) {
    return this.store.findBySubject(providerSubject);
  }

  findForUser(userId: string) {
    return this.store.findForUser(userId);
  }

  link(
    providerSubject: string,
    userId: string,
    emailAtLink: string,
    linkedAt = new Date(),
  ): Promise<GoogleIdentityLinkResult> {
    return this.store.link({
      providerSubject,
      userId,
      emailAtLink,
      linkedAt,
    });
  }

  unlinkForUser(userId: string): Promise<boolean> {
    return this.store.unlinkForUser(userId);
  }
}
