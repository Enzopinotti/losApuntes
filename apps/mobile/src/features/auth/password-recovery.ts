import type {
  AcceptedResponse,
  ActionTokenInput,
  EmailActionRequestInput,
  PasswordRecoveryCompleteInput,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

import type { AuthActionTokenVault } from "./action-token-vault";
export { newPasswordValidationMessage } from "./password-policy";

export type PasswordRecoveryFailure =
  "invalid_link" | "offline" | "timeout" | "server_unavailable" | "rejected";

export type PasswordRecoveryRetryableFailure = Exclude<
  PasswordRecoveryFailure,
  "invalid_link"
>;

type PasswordRecoveryRequestResult =
  "accepted" | "offline" | "timeout" | "server_unavailable" | "rejected";

export type PasswordRecoverySnapshot =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ready"; failure?: PasswordRecoveryRetryableFailure }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "failed"; failure: PasswordRecoveryFailure };

export interface PasswordRecoveryApi {
  requestPasswordRecovery(
    input: EmailActionRequestInput,
    signal?: AbortSignal,
  ): Promise<AcceptedResponse>;
  inspectPasswordRecovery(
    input: ActionTokenInput,
    signal?: AbortSignal,
  ): Promise<{ recovery: { available: true } }>;
  completePasswordRecovery(
    input: PasswordRecoveryCompleteInput,
    signal?: AbortSignal,
  ): Promise<void>;
}

type Listener = (snapshot: PasswordRecoverySnapshot) => void;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const failureFrom = (error: unknown): PasswordRecoveryFailure => {
  if (error instanceof ApiRequestError) {
    if (error.code === "RECOVERY_NOT_AVAILABLE" || error.kind === "gone") {
      return "invalid_link";
    }
    if (error.kind === "offline") return "offline";
    if (error.kind === "timeout") return "timeout";
    if (error.kind === "server_unavailable") return "server_unavailable";
  }

  return "rejected";
};

export const requestPasswordRecovery = async (
  api: PasswordRecoveryApi,
  email: string,
  signal?: AbortSignal,
): Promise<PasswordRecoveryRequestResult> => {
  try {
    await api.requestPasswordRecovery({ email: normalizeEmail(email) }, signal);
    return "accepted";
  } catch (error) {
    const failure = failureFrom(error);
    return failure === "invalid_link" ? "rejected" : failure;
  }
};

export class PasswordRecoveryController {
  private snapshot: PasswordRecoverySnapshot = { kind: "idle" };
  private token: string | null = null;
  private generation = 0;
  private activeRequest: AbortController | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly api: PasswordRecoveryApi,
    private readonly vault: AuthActionTokenVault,
  ) {}

  getSnapshot(): PasswordRecoverySnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async inspect(handle: string): Promise<void> {
    this.cancelActiveRequest();
    this.clearToken();

    const token = this.vault.take(handle, "password_recovery");
    if (!token) {
      this.publish({ kind: "failed", failure: "invalid_link" });
      return;
    }

    this.token = token;
    await this.inspectCurrentToken();
  }

  async retryInspect(): Promise<void> {
    if (!this.token) {
      this.publish({ kind: "failed", failure: "invalid_link" });
      return;
    }

    await this.inspectCurrentToken();
  }

  async complete(newPassword: string): Promise<void> {
    const token = this.token;
    if (!token) {
      this.publish({ kind: "failed", failure: "invalid_link" });
      return;
    }

    this.cancelActiveRequest();
    const generation = this.generation;
    const controller = new AbortController();
    this.activeRequest = controller;
    this.publish({ kind: "submitting" });

    try {
      await this.api.completePasswordRecovery(
        { token, newPassword },
        controller.signal,
      );
      if (generation !== this.generation) return;

      this.activeRequest = null;
      this.clearToken();
      this.publish({ kind: "success" });
    } catch (error) {
      if (generation !== this.generation) return;

      this.activeRequest = null;
      const failure = failureFrom(error);

      if (failure === "invalid_link") {
        this.clearToken();
        this.publish({ kind: "failed", failure });
        return;
      }

      this.token = token;
      this.publish({ kind: "ready", failure });
    }
  }

  reset(): void {
    this.cancelActiveRequest();
    this.clearToken();
    this.publish({ kind: "idle" });
  }

  dispose(): void {
    this.cancelActiveRequest();
    this.clearToken();
    this.listeners.clear();
  }

  private async inspectCurrentToken(): Promise<void> {
    const token = this.token;
    if (!token) {
      this.publish({ kind: "failed", failure: "invalid_link" });
      return;
    }

    this.cancelActiveRequest();
    const generation = this.generation;
    const controller = new AbortController();
    this.activeRequest = controller;
    this.publish({ kind: "checking" });

    try {
      await this.api.inspectPasswordRecovery({ token }, controller.signal);
      if (generation !== this.generation) return;

      this.activeRequest = null;
      this.token = token;
      this.publish({ kind: "ready" });
    } catch (error) {
      if (generation !== this.generation) return;

      this.activeRequest = null;
      const failure = failureFrom(error);

      if (failure === "invalid_link") {
        this.clearToken();
      } else {
        this.token = token;
      }

      this.publish({ kind: "failed", failure });
    }
  }

  private cancelActiveRequest(): void {
    this.generation += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
  }

  private clearToken(): void {
    this.token = null;
  }

  private publish(snapshot: PasswordRecoverySnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
