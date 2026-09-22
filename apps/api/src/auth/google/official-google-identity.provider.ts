import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CodeChallengeMethod,
  OAuth2Client,
  type TokenPayload,
} from 'google-auth-library';

import type {
  GoogleIdentityProof,
  GoogleIdentityProvider,
} from './google.types';

type TokenPayloadWithNonce = TokenPayload & {
  nonce?: string;
};

function proofFromPayload(
  payload: TokenPayload | undefined,
): GoogleIdentityProof {
  if (!payload?.sub || !payload.email) {
    throw new Error('Google identity payload is incomplete');
  }

  const withNonce = payload as TokenPayloadWithNonce;

  return {
    subject: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    hostedDomain: payload.hd,
    displayName: payload.name,
    avatarUrl: payload.picture,
    nonce: withNonce.nonce,
  };
}

@Injectable()
export class OfficialGoogleIdentityProvider implements GoogleIdentityProvider {
  private readonly enabled: boolean;
  private readonly webClientId?: string;
  private readonly nativeClientIds: string[];
  private readonly webClient?: OAuth2Client;
  private readonly verifier = new OAuth2Client();

  constructor(private readonly config: ConfigService) {
    this.enabled = config.get<boolean>('GOOGLE_AUTH_ENABLED') ?? false;
    this.webClientId = config.get<string>('GOOGLE_WEB_CLIENT_ID');
    this.nativeClientIds =
      config.get<string[]>('GOOGLE_NATIVE_CLIENT_IDS') ?? [];

    const clientSecret = config.get<string>('GOOGLE_WEB_CLIENT_SECRET');
    const redirectUri = config.get<string>('GOOGLE_WEB_REDIRECT_URI');

    if (this.enabled && this.webClientId && clientSecret && redirectUri) {
      this.webClient = new OAuth2Client({
        clientId: this.webClientId,
        clientSecret,
        redirectUri,
      });
    }
  }

  isWebEnabled(): boolean {
    return this.enabled && Boolean(this.webClient && this.webClientId);
  }

  isMobileEnabled(): boolean {
    return this.enabled && this.nativeClientIds.length > 0;
  }

  createWebAuthorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string {
    if (!this.webClient) {
      throw new Error('Google Web auth is not configured');
    }

    return this.webClient.generateAuthUrl({
      access_type: 'online',
      prompt: 'select_account',
      scope: ['openid', 'email', 'profile'],
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
  }

  async exchangeWebAuthorizationCode(
    code: string,
    codeVerifier: string,
  ): Promise<GoogleIdentityProof> {
    if (!this.webClient || !this.webClientId) {
      throw new Error('Google Web auth is not configured');
    }

    const response = await this.webClient.getToken({
      code,
      codeVerifier,
    });
    const idToken = response.tokens.id_token;

    if (!idToken) {
      throw new Error('Google token response did not include an ID token');
    }

    const ticket = await this.verifier.verifyIdToken({
      idToken,
      audience: this.webClientId,
    });

    return proofFromPayload(ticket.getPayload());
  }

  async verifyMobileIdToken(idToken: string): Promise<GoogleIdentityProof> {
    if (!this.isMobileEnabled()) {
      throw new Error('Google Mobile auth is not configured');
    }

    const ticket = await this.verifier.verifyIdToken({
      idToken,
      audience: this.nativeClientIds,
    });

    return proofFromPayload(ticket.getPayload());
  }
}
