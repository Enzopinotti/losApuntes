import type {
  AuthSession,
  AuthSessionListResponse,
  GoogleAvailabilityResponse,
  GoogleMobileLinkInput,
  GoogleUnlinkInput,
  LoginMethodsResponse,
  PasswordChangeInput,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

export type SecurityFailure =
  | "invalid_current_password"
  | "conflict"
  | "unauthorized"
  | "restricted"
  | "offline"
  | "timeout"
  | "server_unavailable"
  | "google_unavailable"
  | "google_identity_already_linked"
  | "google_unlink_would_lock_account"
  | "rejected";

export type SecuritySnapshot =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      sessions: readonly AuthSession[];
      truncated: boolean;
      limit: number;
      busyAction: string | null;
      feedback: string | null;
      failure: SecurityFailure | null;
      googleAvailability: GoogleAvailabilityResponse | null;
      loginMethods: LoginMethodsResponse | null;
      googleFailure: SecurityFailure | null;
    }
  | {
      kind: "signed_out";
      reason:
        | "current_session_revoked"
        | "all_sessions_revoked"
        | "password_changed"
        | "account_restricted"
        | "authority_lost";
    }
  | { kind: "failed"; failure: SecurityFailure };

export interface MobileSecurityApi {
  listSessions(signal?: AbortSignal): Promise<AuthSessionListResponse>;
  revokeSession(sessionId: string, signal?: AbortSignal): Promise<void>;
  revokeAllSessions(signal?: AbortSignal): Promise<void>;
  changePassword(
    input: PasswordChangeInput,
    signal?: AbortSignal,
  ): Promise<void>;
  googleStatus(signal?: AbortSignal): Promise<GoogleAvailabilityResponse>;
  loginMethods(signal?: AbortSignal): Promise<LoginMethodsResponse>;
  linkGoogle(input: GoogleMobileLinkInput, signal?: AbortSignal): Promise<void>;
  unlinkGoogle(input: GoogleUnlinkInput, signal?: AbortSignal): Promise<void>;
}

type Listener = (snapshot: SecuritySnapshot) => void;
type ReadySecuritySnapshot = Extract<SecuritySnapshot, { kind: "ready" }>;

const exitReasonFromFailure = (
  failure: SecurityFailure,
): Extract<SecuritySnapshot, { kind: "signed_out" }>["reason"] | null => {
  if (failure === "restricted") return "account_restricted";
  if (failure === "unauthorized") return "authority_lost";
  return null;
};

const failureFrom = (error: unknown): SecurityFailure => {
  if (error instanceof ApiRequestError) {
    if (error.code === "INVALID_CURRENT_PASSWORD") {
      return "invalid_current_password";
    }
    if (error.code === "REAUTHENTICATION_REQUIRED") {
      return "invalid_current_password";
    }
    if (error.code === "GOOGLE_AUTH_UNAVAILABLE") return "google_unavailable";
    if (error.code === "GOOGLE_IDENTITY_ALREADY_LINKED") {
      return "google_identity_already_linked";
    }
    if (error.code === "GOOGLE_UNLINK_WOULD_LOCK_ACCOUNT") {
      return "google_unlink_would_lock_account";
    }
    if (
      error.code === "PASSWORD_CHANGE_CONFLICT" ||
      error.kind === "conflict"
    ) {
      return "conflict";
    }
    if (error.code === "ACCOUNT_RESTRICTED") return "restricted";
    if (error.kind === "unauthorized") return "unauthorized";
    if (error.kind === "offline") return "offline";
    if (error.kind === "timeout") return "timeout";
    if (error.kind === "server_unavailable") return "server_unavailable";
  }

  return "rejected";
};

export class MobileSecurityController {
  private snapshot: SecuritySnapshot = { kind: "idle" };
  private generation = 0;
  private activeRequest: AbortController | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly api: MobileSecurityApi) {}

  getSnapshot(): SecuritySnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(): Promise<void> {
    const operation = this.beginOperation();
    this.publish({ kind: "loading" });

    try {
      const [sessions, googleStatus, loginMethods] = await Promise.all([
        this.api.listSessions(operation.signal),
        this.api.googleStatus(operation.signal).then(
          (value) => ({ value, failure: null as SecurityFailure | null }),
          (error) => ({ value: null, failure: failureFrom(error) }),
        ),
        this.api.loginMethods(operation.signal).then(
          (value) => ({ value, failure: null as SecurityFailure | null }),
          (error) => ({ value: null, failure: failureFrom(error) }),
        ),
      ]);
      if (!this.isCurrent(operation.generation)) return;

      this.activeRequest = null;
      const authFailure = [googleStatus.failure, loginMethods.failure].find(
        (failure) => failure && exitReasonFromFailure(failure),
      );
      if (authFailure) {
        this.publish({
          kind: "signed_out",
          reason: exitReasonFromFailure(authFailure)!,
        });
        return;
      }
      this.publishReady(
        sessions,
        null,
        null,
        googleStatus.value,
        loginMethods.value,
        googleStatus.failure ?? loginMethods.failure,
      );
    } catch (error) {
      if (!this.isCurrent(operation.generation)) return;

      this.activeRequest = null;
      const failure = failureFrom(error);
      const exitReason = exitReasonFromFailure(failure);
      if (exitReason) {
        this.publish({ kind: "signed_out", reason: exitReason });
        return;
      }

      this.publish({ kind: "failed", failure });
    }
  }

  async revokeSession(target: AuthSession): Promise<void> {
    const current = this.readySnapshot();
    if (!current) return;

    const operation = this.beginOperation();
    this.publish({
      ...current,
      busyAction: `session:${target.id}`,
      feedback: null,
      failure: null,
    });

    try {
      await this.api.revokeSession(target.id, operation.signal);
      if (!this.isCurrent(operation.generation)) return;

      this.activeRequest = null;
      if (target.current) {
        this.publish({
          kind: "signed_out",
          reason: "current_session_revoked",
        });
        return;
      }

      await this.reloadAfterMutation(operation.generation, "Sesión cerrada.");
    } catch (error) {
      if (!this.isCurrent(operation.generation)) return;

      this.activeRequest = null;
      const failure = failureFrom(error);
      const exitReason = exitReasonFromFailure(failure);
      if (exitReason) {
        this.publish({ kind: "signed_out", reason: exitReason });
        return;
      }

      this.publish({
        ...current,
        busyAction: null,
        feedback: null,
        failure,
      });
    }
  }

  async revokeAllSessions(): Promise<void> {
    const current = this.readySnapshot();
    if (!current) return;

    const operation = this.beginOperation();
    this.publish({
      ...current,
      busyAction: "all-sessions",
      feedback: null,
      failure: null,
    });

    try {
      await this.api.revokeAllSessions(operation.signal);
      if (!this.isCurrent(operation.generation)) return;

      this.activeRequest = null;
      this.publish({
        kind: "signed_out",
        reason: "all_sessions_revoked",
      });
    } catch (error) {
      if (!this.isCurrent(operation.generation)) return;

      this.activeRequest = null;
      const failure = failureFrom(error);
      const exitReason = exitReasonFromFailure(failure);
      if (exitReason) {
        this.publish({ kind: "signed_out", reason: exitReason });
        return;
      }

      this.publish({
        ...current,
        busyAction: null,
        feedback: null,
        failure,
      });
    }
  }

  async changePassword(input: PasswordChangeInput): Promise<void> {
    const current = this.readySnapshot();
    if (!current) return;

    const operation = this.beginOperation();
    this.publish({
      ...current,
      busyAction: "password",
      feedback: null,
      failure: null,
    });

    try {
      await this.api.changePassword(input, operation.signal);
      if (!this.isCurrent(operation.generation)) return;

      this.activeRequest = null;
      this.publish({
        kind: "signed_out",
        reason: "password_changed",
      });
    } catch (error) {
      if (!this.isCurrent(operation.generation)) return;

      this.activeRequest = null;
      const failure = failureFrom(error);
      const exitReason = exitReasonFromFailure(failure);
      if (exitReason) {
        this.publish({ kind: "signed_out", reason: exitReason });
        return;
      }

      this.publish({
        ...current,
        busyAction: null,
        feedback: null,
        failure,
      });
    }
  }

  async linkGoogle(input: GoogleMobileLinkInput): Promise<void> {
    await this.mutateGoogle("link-google", (signal) =>
      this.api.linkGoogle(input, signal),
    );
  }

  async unlinkGoogle(input: GoogleUnlinkInput): Promise<void> {
    const current = this.readySnapshot();
    if (!current || current.busyAction !== null) return;
    if (
      current.loginMethods?.googleConnected &&
      !current.loginMethods.passwordConfigured
    ) {
      this.publish({
        ...current,
        failure: "google_unlink_would_lock_account",
        feedback: null,
      });
      return;
    }
    await this.mutateGoogle("unlink-google", (signal) =>
      this.api.unlinkGoogle(input, signal),
    );
  }

  private async mutateGoogle(
    action: "link-google" | "unlink-google",
    mutation: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    const current = this.readySnapshot();
    if (!current || current.busyAction !== null) return;

    const operation = this.beginOperation();
    this.publish({
      ...current,
      busyAction: action,
      feedback: null,
      failure: null,
      googleFailure: null,
    });

    try {
      await mutation(operation.signal);
      if (!this.isCurrent(operation.generation)) return;
      this.activeRequest = null;
      await this.reloadAfterMutation(
        operation.generation,
        action === "link-google"
          ? "Google quedó vinculado."
          : "Google quedó desvinculado.",
      );
    } catch (error) {
      if (!this.isCurrent(operation.generation)) return;
      this.activeRequest = null;
      const failure = failureFrom(error);
      const exitReason = exitReasonFromFailure(failure);
      if (exitReason) {
        this.publish({ kind: "signed_out", reason: exitReason });
        return;
      }
      this.publish({
        ...current,
        busyAction: null,
        feedback: null,
        failure,
      });
    }
  }

  clearFeedback(): void {
    const current = this.readySnapshot();
    if (!current) return;

    this.publish({
      ...current,
      feedback: null,
      failure: null,
    });
  }

  dispose(): void {
    this.generation += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.listeners.clear();
  }

  private async reloadAfterMutation(
    generation: number,
    feedback: string,
  ): Promise<void> {
    if (!this.isCurrent(generation)) return;

    const controller = new AbortController();
    this.activeRequest = controller;

    try {
      const [sessions, googleStatus, loginMethods] = await Promise.all([
        this.api.listSessions(controller.signal),
        this.api.googleStatus(controller.signal).then(
          (value) => ({ value, failure: null as SecurityFailure | null }),
          (error) => ({ value: null, failure: failureFrom(error) }),
        ),
        this.api.loginMethods(controller.signal).then(
          (value) => ({ value, failure: null as SecurityFailure | null }),
          (error) => ({ value: null, failure: failureFrom(error) }),
        ),
      ]);
      if (!this.isCurrent(generation)) return;

      this.activeRequest = null;
      const authFailure = [googleStatus.failure, loginMethods.failure].find(
        (failure) => failure && exitReasonFromFailure(failure),
      );
      if (authFailure) {
        this.publish({
          kind: "signed_out",
          reason: exitReasonFromFailure(authFailure)!,
        });
        return;
      }
      this.publishReady(
        sessions,
        feedback,
        null,
        googleStatus.value,
        loginMethods.value,
        googleStatus.failure ?? loginMethods.failure,
      );
    } catch (error) {
      if (!this.isCurrent(generation)) return;

      this.activeRequest = null;
      const failure = failureFrom(error);
      const exitReason = exitReasonFromFailure(failure);
      if (exitReason) {
        this.publish({ kind: "signed_out", reason: exitReason });
        return;
      }

      this.publish({ kind: "failed", failure });
    }
  }

  private beginOperation(): {
    generation: number;
    signal: AbortSignal;
  } {
    this.generation += 1;
    this.activeRequest?.abort();

    const controller = new AbortController();
    this.activeRequest = controller;

    return {
      generation: this.generation,
      signal: controller.signal,
    };
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private readySnapshot(): ReadySecuritySnapshot | null {
    return this.snapshot.kind === "ready" ? this.snapshot : null;
  }

  private publishReady(
    result: AuthSessionListResponse,
    feedback: string | null,
    failure: SecurityFailure | null,
    googleAvailability: GoogleAvailabilityResponse | null,
    loginMethods: LoginMethodsResponse | null,
    googleFailure: SecurityFailure | null,
  ): void {
    this.publish({
      kind: "ready",
      sessions: Object.freeze([...result.sessions]),
      truncated: result.truncated,
      limit: result.limit,
      busyAction: null,
      feedback,
      failure,
      googleAvailability,
      loginMethods,
      googleFailure,
    });
  }

  private publish(snapshot: SecuritySnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
