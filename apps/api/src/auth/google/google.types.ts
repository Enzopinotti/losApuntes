export const GOOGLE_IDENTITY_PROVIDER = Symbol('GOOGLE_IDENTITY_PROVIDER');
export const GOOGLE_EXTERNAL_IDENTITY_STORE = Symbol(
  'GOOGLE_EXTERNAL_IDENTITY_STORE',
);
export const GOOGLE_OAUTH_ATTEMPT_STORE = Symbol('GOOGLE_OAUTH_ATTEMPT_STORE');

export type GoogleIdentityProof = {
  subject: string;
  email: string;
  emailVerified: boolean;
  hostedDomain?: string;
  displayName?: string;
  avatarUrl?: string;
  nonce?: string;
};

export interface GoogleIdentityProvider {
  isWebEnabled(): boolean;
  isMobileEnabled(): boolean;
  createWebAuthorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string;
  exchangeWebAuthorizationCode(
    code: string,
    codeVerifier: string,
  ): Promise<GoogleIdentityProof>;
  verifyMobileIdToken(idToken: string): Promise<GoogleIdentityProof>;
}

export type GoogleExternalIdentityRecord = {
  id: string;
  provider: 'google';
  providerSubject: string;
  userId: string;
  emailAtLink: string;
  linkedAt: Date;
};

export type GoogleIdentityLinkResult =
  | { kind: 'linked'; identity: GoogleExternalIdentityRecord }
  | { kind: 'already_linked'; identity: GoogleExternalIdentityRecord }
  | { kind: 'subject_in_use'; identity: GoogleExternalIdentityRecord }
  | { kind: 'user_already_has_google'; identity: GoogleExternalIdentityRecord };

export interface GoogleExternalIdentityStore {
  findBySubject(
    providerSubject: string,
  ): Promise<GoogleExternalIdentityRecord | null>;
  findForUser(userId: string): Promise<GoogleExternalIdentityRecord | null>;
  link(input: {
    providerSubject: string;
    userId: string;
    emailAtLink: string;
    linkedAt: Date;
  }): Promise<GoogleIdentityLinkResult>;
  unlinkForUser(userId: string): Promise<boolean>;
}

export type GoogleOAuthIntent = 'login' | 'link';

export type GoogleOAuthAttemptRecord = {
  id: string;
  stateHash: string;
  nonceHash: string;
  codeVerifier: string;
  intent: GoogleOAuthIntent;
  userId?: string;
  returnPath: string;
  createdAt: Date;
  expiresAt: Date;
};

export interface GoogleOAuthAttemptStore {
  create(input: GoogleOAuthAttemptRecord): Promise<void>;
  consumeByStateHash(
    stateHash: string,
    now: Date,
  ): Promise<GoogleOAuthAttemptRecord | null>;
}
