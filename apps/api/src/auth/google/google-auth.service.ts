import { Inject, Injectable } from '@nestjs/common';

import {
  credentialVersion,
  isAccountActive,
} from '../../users/user-security-state';
import type { UserDocument } from '../../users/schemas/user.schema';
import { UsersService } from '../../users/users.service';
import { AuthAuditService } from '../audit/auth-audit.service';
import { PasswordService } from '../password.service';
import { AuthSessionService } from '../session/auth-session.service';
import type {
  AuthClientType,
  PublicAuthSession,
} from '../session/auth-session.types';
import { GoogleIdentityService } from './google-identity.service';
import { GoogleOAuthAttemptService } from './google-oauth-attempt.service';
import {
  isGoogleAuthoritativeMailbox,
  normalizeGoogleEmail,
  validGoogleProof,
} from './google-proof';
import {
  GOOGLE_IDENTITY_PROVIDER,
  type GoogleIdentityProof,
  type GoogleIdentityProvider,
} from './google.types';

export type GoogleAuthenticatedOutcome = {
  kind: 'authenticated';
  user: {
    id: string;
    email: string;
  };
  sessionToken: string;
  session: PublicAuthSession;
};

export type GoogleLoginOutcome =
  | GoogleAuthenticatedOutcome
  | { kind: 'link_required' }
  | { kind: 'account_restricted' }
  | { kind: 'identity_already_linked' }
  | { kind: 'unavailable' }
  | { kind: 'failed' };

export type GoogleLinkOutcome =
  | { kind: 'linked' }
  | { kind: 'already_linked' }
  | { kind: 'identity_already_linked' }
  | { kind: 'reauthentication_required' }
  | { kind: 'account_restricted' }
  | { kind: 'unavailable' }
  | { kind: 'failed' };

type GoogleVerifiedLinkOutcome =
  | { kind: 'linked' }
  | { kind: 'already_linked' }
  | { kind: 'identity_already_linked' }
  | { kind: 'account_restricted' }
  | { kind: 'failed' };

export type GoogleUnlinkOutcome =
  | { kind: 'unlinked' }
  | { kind: 'not_linked' }
  | { kind: 'would_lock_account' }
  | { kind: 'reauthentication_required' }
  | { kind: 'account_restricted' };

export type GoogleWebStartOutcome =
  | { kind: 'started'; authorizationUrl: string }
  | { kind: 'unavailable' }
  | { kind: 'reauthentication_required' }
  | { kind: 'already_linked' }
  | { kind: 'account_restricted' };

export type GoogleWebCallbackOutcome = {
  returnPath: string;
  result:
    | GoogleLoginOutcome
    | { kind: 'linked' }
    | { kind: 'already_linked' }
    | { kind: 'cancelled' };
};

@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly users: UsersService,
    private readonly identities: GoogleIdentityService,
    private readonly attempts: GoogleOAuthAttemptService,
    private readonly sessions: AuthSessionService,
    private readonly passwords: PasswordService,
    private readonly audit: AuthAuditService,
    @Inject(GOOGLE_IDENTITY_PROVIDER)
    private readonly provider: GoogleIdentityProvider,
  ) {}

  availability() {
    return {
      webEnabled: this.provider.isWebEnabled(),
      mobileEnabled: this.provider.isMobileEnabled(),
    };
  }

  async startWebLogin(
    returnPath: string | undefined,
  ): Promise<GoogleWebStartOutcome> {
    if (!this.provider.isWebEnabled()) {
      return { kind: 'unavailable' };
    }

    const attempt = await this.attempts.issue('login', undefined, returnPath);

    return {
      kind: 'started',
      authorizationUrl: this.provider.createWebAuthorizationUrl(attempt),
    };
  }

  async startWebLink(
    userId: string,
    currentPassword: string,
    returnPath: string | undefined,
  ): Promise<GoogleWebStartOutcome> {
    if (!this.provider.isWebEnabled()) {
      return { kind: 'unavailable' };
    }

    const user = await this.users.findById(userId);
    if (!user) {
      return { kind: 'reauthentication_required' };
    }

    if (!isAccountActive(user)) {
      return { kind: 'account_restricted' };
    }

    if (await this.identities.findForUser(userId)) {
      return { kind: 'already_linked' };
    }

    if (
      !user.password_hash ||
      !(await this.passwords.verify(currentPassword, user.password_hash))
    ) {
      return { kind: 'reauthentication_required' };
    }

    const attempt = await this.attempts.issue('link', userId, returnPath);

    return {
      kind: 'started',
      authorizationUrl: this.provider.createWebAuthorizationUrl(attempt),
    };
  }

  async completeWebCallback(input: {
    state: string;
    code?: string;
    providerError?: string;
  }): Promise<GoogleWebCallbackOutcome> {
    const attempt = await this.attempts.consume(input.state);

    if (!attempt) {
      return {
        returnPath: '/login',
        result: { kind: 'failed' },
      };
    }

    if (input.providerError) {
      return {
        returnPath: attempt.returnPath,
        result: {
          kind:
            input.providerError === 'access_denied' ? 'cancelled' : 'failed',
        },
      };
    }

    if (!input.code || !this.provider.isWebEnabled()) {
      return {
        returnPath: attempt.returnPath,
        result: { kind: 'failed' },
      };
    }

    let proof: GoogleIdentityProof;
    try {
      proof = await this.provider.exchangeWebAuthorizationCode(
        input.code,
        attempt.codeVerifier,
      );
    } catch {
      return {
        returnPath: attempt.returnPath,
        result: { kind: 'failed' },
      };
    }

    if (!proof.nonce || !this.attempts.nonceMatches(attempt, proof.nonce)) {
      return {
        returnPath: attempt.returnPath,
        result: { kind: 'failed' },
      };
    }

    if (attempt.intent === 'link') {
      if (!attempt.userId) {
        return {
          returnPath: attempt.returnPath,
          result: { kind: 'failed' },
        };
      }

      return {
        returnPath: attempt.returnPath,
        result: await this.linkVerifiedProof(attempt.userId, proof),
      };
    }

    return {
      returnPath: attempt.returnPath,
      result: await this.loginWithProof(proof, 'web'),
    };
  }

  async loginMobile(idToken: string): Promise<GoogleLoginOutcome> {
    if (!this.provider.isMobileEnabled()) {
      return { kind: 'unavailable' };
    }

    try {
      const proof = await this.provider.verifyMobileIdToken(idToken);
      return this.loginWithProof(proof, 'mobile');
    } catch {
      return { kind: 'failed' };
    }
  }

  async linkMobile(
    userId: string,
    currentPassword: string,
    idToken: string,
  ): Promise<GoogleLinkOutcome> {
    if (!this.provider.isMobileEnabled()) {
      return { kind: 'unavailable' };
    }

    const reauth = await this.reauthenticatePassword(userId, currentPassword);
    if (reauth !== 'ok') {
      return { kind: reauth };
    }

    try {
      const proof = await this.provider.verifyMobileIdToken(idToken);
      return this.linkVerifiedProof(userId, proof);
    } catch {
      return { kind: 'failed' };
    }
  }

  async unlink(
    userId: string,
    currentPassword: string,
  ): Promise<GoogleUnlinkOutcome> {
    const user = await this.users.findById(userId);
    if (!user) {
      return { kind: 'reauthentication_required' };
    }

    if (!isAccountActive(user)) {
      return { kind: 'account_restricted' };
    }

    const identity = await this.identities.findForUser(userId);
    if (!identity) {
      return { kind: 'not_linked' };
    }

    if (!user.password_hash) {
      return { kind: 'would_lock_account' };
    }

    if (!(await this.passwords.verify(currentPassword, user.password_hash))) {
      return { kind: 'reauthentication_required' };
    }

    const removed = await this.identities.unlinkForUser(userId);
    if (removed) {
      await this.audit.record({
        event: 'auth.oauth.unlinked',
        userId,
      });
    }

    return { kind: removed ? 'unlinked' : 'not_linked' };
  }

  async loginMethods(userId: string) {
    const [user, google] = await Promise.all([
      this.users.findById(userId),
      this.identities.findForUser(userId),
    ]);

    if (!user) {
      return null;
    }

    return {
      passwordConfigured: Boolean(user.password_hash),
      googleConnected: Boolean(google),
    };
  }

  private async loginWithProof(
    proof: GoogleIdentityProof,
    clientType: AuthClientType,
  ): Promise<GoogleLoginOutcome> {
    if (!validGoogleProof(proof)) {
      return { kind: 'failed' };
    }

    const linked = await this.identities.findBySubject(proof.subject);
    if (linked) {
      return this.issueForLinkedUser(linked.userId, clientType);
    }

    if (!isGoogleAuthoritativeMailbox(proof)) {
      return { kind: 'failed' };
    }

    const email = normalizeGoogleEmail(proof.email);
    if (await this.users.findByEmail(email)) {
      return { kind: 'link_required' };
    }

    const created = await this.users.createGoogleAccountIfEmailFree(
      email,
      new Date(),
    );

    if (!created) {
      const racedIdentity = await this.identities.findBySubject(proof.subject);
      if (racedIdentity) {
        return this.issueForLinkedUser(racedIdentity.userId, clientType);
      }

      return { kind: 'link_required' };
    }

    const userId = created._id.toString();

    try {
      const link = await this.identities.link(proof.subject, userId, email);

      if (link.kind === 'subject_in_use') {
        await this.users.deleteGoogleOnlyAccountIfUnclaimed(userId);
        return this.issueForLinkedUser(link.identity.userId, clientType);
      }

      if (link.kind === 'user_already_has_google') {
        return { kind: 'failed' };
      }
    } catch (error) {
      await this.users.deleteGoogleOnlyAccountIfUnclaimed(userId);
      throw error;
    }

    await this.audit.record({
      event: 'auth.oauth.linked',
      userId,
    });

    return this.issueForUser(created, clientType);
  }

  private async linkVerifiedProof(
    userId: string,
    proof: GoogleIdentityProof,
  ): Promise<GoogleVerifiedLinkOutcome> {
    if (!validGoogleProof(proof) || !isGoogleAuthoritativeMailbox(proof)) {
      return { kind: 'failed' };
    }

    const user = await this.users.findById(userId);
    if (!user) {
      return { kind: 'failed' };
    }

    if (!isAccountActive(user)) {
      return { kind: 'account_restricted' };
    }

    const result = await this.identities.link(
      proof.subject,
      userId,
      normalizeGoogleEmail(proof.email),
    );

    if (result.kind === 'subject_in_use') {
      return { kind: 'identity_already_linked' };
    }

    if (result.kind === 'user_already_has_google') {
      return { kind: 'identity_already_linked' };
    }

    if (result.kind === 'linked') {
      await this.audit.record({
        event: 'auth.oauth.linked',
        userId,
      });
      return { kind: 'linked' };
    }

    return { kind: 'already_linked' };
  }

  private async issueForLinkedUser(
    userId: string,
    clientType: AuthClientType,
  ): Promise<GoogleLoginOutcome> {
    const user = await this.users.findById(userId);
    if (!user) {
      return { kind: 'failed' };
    }

    if (!isAccountActive(user)) {
      return { kind: 'account_restricted' };
    }

    return this.issueForUser(user, clientType);
  }

  private async issueForUser(
    user: UserDocument,
    clientType: AuthClientType,
  ): Promise<GoogleAuthenticatedOutcome> {
    const issued = await this.sessions.issue(
      user._id.toString(),
      clientType,
      credentialVersion(user),
    );

    return {
      kind: 'authenticated',
      user: {
        id: user._id.toString(),
        email: user.email,
      },
      sessionToken: issued.sessionToken,
      session: issued.session,
    };
  }

  private async reauthenticatePassword(
    userId: string,
    currentPassword: string,
  ): Promise<'ok' | 'reauthentication_required' | 'account_restricted'> {
    const user = await this.users.findById(userId);
    if (!user?.password_hash) {
      return 'reauthentication_required';
    }

    if (!isAccountActive(user)) {
      return 'account_restricted';
    }

    return (await this.passwords.verify(currentPassword, user.password_hash))
      ? 'ok'
      : 'reauthentication_required';
  }
}
