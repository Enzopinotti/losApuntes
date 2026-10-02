import type {
  AcceptedResponse,
  EmailActionRequestInput,
  RegisterInput,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

export type EmailOnboardingAction = "register" | "request_verification";
export type EmailOnboardingFailure =
  "offline" | "timeout" | "server_unavailable" | "rejected";

export type EmailOnboardingSnapshot =
  | { kind: "idle" }
  | { kind: "pending"; action: EmailOnboardingAction; email: string }
  | { kind: "accepted"; action: EmailOnboardingAction; email: string }
  | {
      kind: "failed";
      action: EmailOnboardingAction;
      email: string;
      failure: EmailOnboardingFailure;
    };

export interface EmailOnboardingApi {
  register(
    input: RegisterInput,
    signal?: AbortSignal,
  ): Promise<AcceptedResponse>;
  requestEmailVerification(
    input: EmailActionRequestInput,
    signal?: AbortSignal,
  ): Promise<AcceptedResponse>;
}

type Listener = (snapshot: EmailOnboardingSnapshot) => void;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const failureFrom = (error: unknown): EmailOnboardingFailure => {
  if (error instanceof ApiRequestError) {
    if (error.kind === "offline") return "offline";
    if (error.kind === "timeout") return "timeout";
    if (error.kind === "server_unavailable") return "server_unavailable";
  }
  return "rejected";
};

export class EmailOnboardingController {
  private snapshot: EmailOnboardingSnapshot = { kind: "idle" };
  private generation = 0;
  private activeRequest: AbortController | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly api: EmailOnboardingApi) {}

  getSnapshot(): EmailOnboardingSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  register(email: string, password: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    return this.run("register", normalizedEmail, (signal) =>
      this.api.register({ email: normalizedEmail, password }, signal),
    );
  }

  requestVerification(email: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    return this.run("request_verification", normalizedEmail, (signal) =>
      this.api.requestEmailVerification({ email: normalizedEmail }, signal),
    );
  }

  reset(): void {
    this.cancelActiveRequest();
    this.publish({ kind: "idle" });
  }

  dispose(): void {
    this.cancelActiveRequest();
    this.listeners.clear();
  }

  private async run(
    action: EmailOnboardingAction,
    email: string,
    request: (signal: AbortSignal) => Promise<AcceptedResponse>,
  ): Promise<void> {
    this.cancelActiveRequest();
    const generation = this.generation;
    const controller = new AbortController();
    this.activeRequest = controller;
    this.publish({ kind: "pending", action, email });

    try {
      await request(controller.signal);
      if (generation !== this.generation) return;
      this.activeRequest = null;
      this.publish({ kind: "accepted", action, email });
    } catch (error) {
      if (generation !== this.generation) return;
      this.activeRequest = null;
      this.publish({
        kind: "failed",
        action,
        email,
        failure: failureFrom(error),
      });
    }
  }

  private cancelActiveRequest(): void {
    this.generation += 1;
    this.activeRequest?.abort();
    this.activeRequest = null;
  }

  private publish(snapshot: EmailOnboardingSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
