import type {
  AuthSession,
  AuthenticatedSessionResponse,
  AuthUser,
  GoogleMobileInput,
  MobileAuthenticatedSessionResponse,
  PasswordLoginInput,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";
import type { SessionCredentialStore } from "@/platform/session-credential-store";

export type SessionSnapshot =
  | { kind: "restoring" }
  | { kind: "unauthenticated" }
  | { kind: "authenticated"; user: AuthUser; session: AuthSession }
  | { kind: "restricted" }
  | { kind: "offline" }
  | { kind: "timeout" }
  | { kind: "server_unavailable" }
  | { kind: "error" };

type Listener = (snapshot: SessionSnapshot) => void;

export interface SessionApi {
  mobileLogin(
    input: PasswordLoginInput,
    signal?: AbortSignal,
  ): Promise<MobileAuthenticatedSessionResponse>;
  googleMobileLogin?(
    input: GoogleMobileInput,
    signal?: AbortSignal,
  ): Promise<MobileAuthenticatedSessionResponse>;
  me(
    credential: string,
    signal?: AbortSignal,
  ): Promise<AuthenticatedSessionResponse>;
  logout(credential: string, signal?: AbortSignal): Promise<void>;
}

const bootstrapFailure = (error: ApiRequestError): SessionSnapshot => {
  if (error.code === "ACCOUNT_RESTRICTED") return { kind: "restricted" };
  if (error.kind === "offline") return { kind: "offline" };
  if (error.kind === "timeout") return { kind: "timeout" };
  if (error.kind === "server_unavailable")
    return { kind: "server_unavailable" };
  return { kind: "error" };
};

export class SessionController {
  private snapshot: SessionSnapshot = { kind: "restoring" };
  private credential: string | null = null;
  private generation = 0;
  private listeners = new Set<Listener>();
  private activeOperation: AbortController | null = null;

  constructor(
    private readonly api: SessionApi,
    private readonly credentials: SessionCredentialStore,
  ) {}

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async restore(): Promise<void> {
    const generation = this.beginOperation({ kind: "restoring" });

    let candidate: string | null;
    try {
      candidate = await this.credentials.read();
    } catch {
      if (this.isCurrent(generation)) this.publish({ kind: "error" });
      return;
    }

    if (!this.isCurrent(generation)) return;
    if (!candidate) {
      this.credential = null;
      this.publish({ kind: "unauthenticated" });
      return;
    }

    try {
      const result = await this.api.me(candidate, this.activeOperation?.signal);
      if (!this.isCurrent(generation)) return;

      this.credential = candidate;
      this.publish({
        kind: "authenticated",
        user: result.user,
        session: result.session,
      });
    } catch (error) {
      if (!this.isCurrent(generation)) return;

      if (error instanceof ApiRequestError && error.kind === "unauthorized") {
        this.credential = null;
        await this.clearCredentialIfCurrent(generation);
        if (this.isCurrent(generation))
          this.publish({ kind: "unauthenticated" });
        return;
      }

      this.publish(
        error instanceof ApiRequestError
          ? bootstrapFailure(error)
          : { kind: "error" },
      );
    }
  }

  async login(input: PasswordLoginInput): Promise<void> {
    return this.loginWith((signal) => this.api.mobileLogin(input, signal));
  }

  async loginWithGoogle(input: GoogleMobileInput): Promise<void> {
    const googleMobileLogin = this.api.googleMobileLogin;
    if (!googleMobileLogin) {
      throw new ApiRequestError(
        "server_unavailable",
        null,
        "GOOGLE_AUTH_UNAVAILABLE",
        "Google mobile login is unavailable",
      );
    }
    return this.loginWith((signal) => googleMobileLogin(input, signal));
  }

  private async loginWith(
    request: (
      signal?: AbortSignal,
    ) => Promise<MobileAuthenticatedSessionResponse>,
  ): Promise<void> {
    const generation = this.beginOperation({ kind: "restoring" });

    try {
      const result = await request(this.activeOperation?.signal);
      if (!this.isCurrent(generation)) {
        await this.bestEffortRevokeCandidate(result.sessionToken);
        return;
      }

      try {
        await this.credentials.write(result.sessionToken);
      } catch {
        await this.bestEffortRevokeCandidate(result.sessionToken);
        if (this.isCurrent(generation)) this.publish({ kind: "error" });
        return;
      }

      if (!this.isCurrent(generation)) {
        await this.bestEffortRevokeCandidate(result.sessionToken);
        return;
      }

      this.credential = result.sessionToken;
      this.publish({
        kind: "authenticated",
        user: result.user,
        session: result.session,
      });
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      if (
        error instanceof ApiRequestError &&
        error.code === "ACCOUNT_RESTRICTED"
      ) {
        this.publish({ kind: "restricted" });
        return;
      }
      this.publish(
        error instanceof ApiRequestError
          ? bootstrapFailure(error)
          : { kind: "error" },
      );
      throw error;
    }
  }

  async logout(): Promise<void> {
    const oldCredential = this.credential;
    const generation = this.beginOperation({ kind: "unauthenticated" });
    this.credential = null;

    const clear = this.clearCredentialIfCurrent(generation);
    const revoke = oldCredential
      ? this.api.logout(oldCredential).catch(() => undefined)
      : Promise.resolve();

    await Promise.allSettled([clear, revoke]);
  }

  suspend(): void {
    this.generation += 1;
    this.activeOperation?.abort();
    this.activeOperation = null;
  }

  async revalidateCurrent(): Promise<void> {
    const credential = this.credential;
    if (!credential) {
      await this.restore();
      return;
    }

    const preserved = this.snapshot;
    const generation = this.startOperation();

    try {
      const result = await this.api.me(
        credential,
        this.activeOperation?.signal,
      );
      if (!this.isCurrent(generation)) return;

      this.publish({
        kind: "authenticated",
        user: result.user,
        session: result.session,
      });
    } catch (error) {
      if (!this.isCurrent(generation)) return;

      if (error instanceof ApiRequestError && error.kind === "unauthorized") {
        this.credential = null;
        await this.clearCredentialIfCurrent(generation);
        if (this.isCurrent(generation)) {
          this.publish({ kind: "unauthenticated" });
        }
        return;
      }

      if (
        error instanceof ApiRequestError &&
        error.code === "ACCOUNT_RESTRICTED"
      ) {
        this.credential = null;
        await this.clearCredentialIfCurrent(generation);
        if (this.isCurrent(generation)) {
          this.publish({ kind: "restricted" });
        }
        return;
      }

      if (preserved.kind === "authenticated") {
        this.publish(preserved);
        return;
      }

      this.publish(
        error instanceof ApiRequestError
          ? bootstrapFailure(error)
          : { kind: "error" },
      );
    }
  }

  getCredentialSnapshot(): { credential: string; generation: number } | null {
    return this.credential
      ? { credential: this.credential, generation: this.generation }
      : null;
  }

  isCredentialAuthoritative(credential: string, generation: number): boolean {
    return this.credential === credential && this.generation === generation;
  }

  invalidateIfAuthoritative(
    credential: string,
    generation: number,
  ): Promise<void> {
    return this.clearAuthorityIfAuthoritative(credential, generation, {
      kind: "unauthenticated",
    });
  }

  restrictIfAuthoritative(
    credential: string,
    generation: number,
  ): Promise<void> {
    return this.clearAuthorityIfAuthoritative(credential, generation, {
      kind: "restricted",
    });
  }

  private clearAuthorityIfAuthoritative(
    credential: string,
    generation: number,
    next: SessionSnapshot,
  ): Promise<void> {
    if (this.credential !== credential || this.generation !== generation) {
      return Promise.resolve();
    }

    this.generation += 1;
    this.activeOperation?.abort();
    this.activeOperation = null;
    this.credential = null;
    this.publish(next);
    return this.credentials.clear().catch(() => undefined);
  }

  private beginOperation(snapshot: SessionSnapshot): number {
    const generation = this.startOperation();
    this.publish(snapshot);
    return generation;
  }

  private startOperation(): number {
    this.generation += 1;
    this.activeOperation?.abort();
    this.activeOperation = new AbortController();
    return this.generation;
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private publish(snapshot: SessionSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  private async clearCredentialIfCurrent(generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return;
    await this.credentials.clear().catch(() => undefined);
  }

  private async bestEffortRevokeCandidate(candidate: string): Promise<void> {
    await this.api.logout(candidate).catch(() => undefined);
  }
}
