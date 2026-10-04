import type {
  AuthSession,
  AuthSessionListResponse,
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
      const result = await this.api.listSessions(operation.signal);
      if (!this.isCurrent(operation.generation)) return;

      this.activeRequest = null;
      this.publishReady(result, null, null);
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
      const result = await this.api.listSessions(controller.signal);
      if (!this.isCurrent(generation)) return;

      this.activeRequest = null;
      this.publishReady(result, feedback, null);
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
  ): void {
    this.publish({
      kind: "ready",
      sessions: Object.freeze([...result.sessions]),
      truncated: result.truncated,
      limit: result.limit,
      busyAction: null,
      feedback,
      failure,
    });
  }

  private publish(snapshot: SecuritySnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
