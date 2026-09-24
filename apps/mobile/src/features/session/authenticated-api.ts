import type {
  AuthSessionListResponse,
  GoogleMobileLinkInput,
  GoogleUnlinkInput,
  LoginMethodsResponse,
  PasswordChangeInput,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

import type { SessionController } from "./session-controller";

export interface AuthenticatedApiTransport {
  listSessions(
    credential: string,
    signal?: AbortSignal,
  ): Promise<AuthSessionListResponse>;
  revokeSession(
    credential: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  revokeAllSessions(
    credential: string,
    signal?: AbortSignal,
  ): Promise<void>;
  changePassword(
    credential: string,
    input: PasswordChangeInput,
    signal?: AbortSignal,
  ): Promise<void>;
  googleMobileLink(
    credential: string,
    input: GoogleMobileLinkInput,
    signal?: AbortSignal,
  ): Promise<void>;
  loginMethods(
    credential: string,
    signal?: AbortSignal,
  ): Promise<LoginMethodsResponse>;
  unlinkGoogle(
    credential: string,
    input: GoogleUnlinkInput,
    signal?: AbortSignal,
  ): Promise<void>;
}

type CredentialSnapshot = {
  credential: string;
  generation: number;
};

export class AuthenticatedMobileApi {
  constructor(
    private readonly session: SessionController,
    private readonly api: AuthenticatedApiTransport,
  ) {}

  async listSessions(signal?: AbortSignal) {
    return (
      await this.execute((credential) =>
        this.api.listSessions(credential, signal),
      )
    ).value;
  }

  async revokeSession(sessionId: string, signal?: AbortSignal): Promise<void> {
    const currentSession =
      this.session.getSnapshot().kind === "authenticated"
        ? this.session.getSnapshot().session.id
        : null;
    const result = await this.execute((credential) =>
      this.api.revokeSession(credential, sessionId, signal),
    );

    if (currentSession === sessionId) {
      await this.session.invalidateIfAuthoritative(
        result.snapshot.credential,
        result.snapshot.generation,
      );
    }
  }

  async revokeAllSessions(signal?: AbortSignal): Promise<void> {
    const result = await this.execute((credential) =>
      this.api.revokeAllSessions(credential, signal),
    );
    await this.session.invalidateIfAuthoritative(
      result.snapshot.credential,
      result.snapshot.generation,
    );
  }

  async changePassword(
    input: PasswordChangeInput,
    signal?: AbortSignal,
  ): Promise<void> {
    const result = await this.execute((credential) =>
      this.api.changePassword(credential, input, signal),
    );
    await this.session.invalidateIfAuthoritative(
      result.snapshot.credential,
      result.snapshot.generation,
    );
  }

  async googleMobileLink(
    input: GoogleMobileLinkInput,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.execute((credential) =>
      this.api.googleMobileLink(credential, input, signal),
    );
  }

  async loginMethods(signal?: AbortSignal) {
    return (
      await this.execute((credential) =>
        this.api.loginMethods(credential, signal),
      )
    ).value;
  }

  async unlinkGoogle(
    input: GoogleUnlinkInput,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.execute((credential) =>
      this.api.unlinkGoogle(credential, input, signal),
    );
  }

  private async execute<T>(
    operation: (credential: string) => Promise<T>,
  ): Promise<{ value: T; snapshot: CredentialSnapshot }> {
    const snapshot = this.session.getCredentialSnapshot();
    if (!snapshot) {
      throw new ApiRequestError(
        "unauthorized",
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication required",
      );
    }

    try {
      return {
        value: await operation(snapshot.credential),
        snapshot,
      };
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.kind === "unauthorized") {
          await this.session.invalidateIfAuthoritative(
            snapshot.credential,
            snapshot.generation,
          );
        } else if (error.code === "ACCOUNT_RESTRICTED") {
          await this.session.restrictIfAuthoritative(
            snapshot.credential,
            snapshot.generation,
          );
        }
      }

      throw error;
    }
  }
}
