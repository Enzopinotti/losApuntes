import type {
  AcademicCurrentContext,
  PilotHomeResponse,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

export interface PilotHomeApi {
  pilotHome(signal?: AbortSignal): Promise<PilotHomeResponse>;
}

export type MobileHomeSnapshot =
  | { kind: "idle" }
  | {
      kind: "loading";
      authorityKey: string;
      previousData?: PilotHomeResponse;
    }
  | {
      kind: "ready";
      authorityKey: string;
      data: PilotHomeResponse;
    }
  | { kind: "context_mismatch"; authorityKey: string }
  | { kind: "offline"; authorityKey: string }
  | { kind: "timeout"; authorityKey: string }
  | { kind: "server_unavailable"; authorityKey: string }
  | { kind: "restricted"; authorityKey: string }
  | { kind: "error"; authorityKey: string; code: string | null };

type Listener = (snapshot: MobileHomeSnapshot) => void;

export const academicContextSignature = (
  context: AcademicCurrentContext | null,
): string =>
  context
    ? `${context.affiliationId}:${context.subjectParticipationId ?? ""}:${context.updatedAt}`
    : "none";

export const academicContextBelongsToSession = (
  sessionAuthority: string | null,
  contextAuthority: string | null,
): boolean =>
  Boolean(
    sessionAuthority && contextAuthority?.startsWith(`${sessionAuthority}:`),
  );

const failureSnapshot = (
  error: unknown,
  authorityKey: string,
): MobileHomeSnapshot => {
  if (!(error instanceof ApiRequestError)) {
    return { kind: "error", authorityKey, code: null };
  }

  if (error.code === "ACCOUNT_RESTRICTED") {
    return { kind: "restricted", authorityKey };
  }
  if (error.kind === "offline") return { kind: "offline", authorityKey };
  if (error.kind === "timeout") return { kind: "timeout", authorityKey };
  if (error.kind === "server_unavailable") {
    return { kind: "server_unavailable", authorityKey };
  }

  return { kind: "error", authorityKey, code: error.code };
};

export class MobileHomeController {
  private snapshot: MobileHomeSnapshot = { kind: "idle" };
  private listeners = new Set<Listener>();
  private operationGeneration = 0;
  private activeOperation: AbortController | null = null;
  private authorityKey: string | null = null;

  constructor(private readonly api: PilotHomeApi) {}

  getSnapshot(): MobileHomeSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(
    authorityKey: string,
    expectedContext: AcademicCurrentContext | null,
  ): Promise<void> {
    const previousData =
      this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
        ? this.snapshot.data
        : this.snapshot.kind === "loading" &&
            this.snapshot.authorityKey === authorityKey
          ? this.snapshot.previousData
          : undefined;
    const generation = this.start(authorityKey, {
      kind: "loading",
      authorityKey,
      ...(previousData ? { previousData } : {}),
    });

    try {
      const response = await this.api.pilotHome(this.activeOperation?.signal);
      if (!this.isCurrent(generation, authorityKey)) return;

      if (
        academicContextSignature(response.academic.currentContext) !==
        academicContextSignature(expectedContext)
      ) {
        this.publish({ kind: "context_mismatch", authorityKey });
        return;
      }

      this.publish({ kind: "ready", authorityKey, data: response });
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return;
      this.publish(failureSnapshot(error, authorityKey));
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && this.authorityKey !== authorityKey) return;

    this.operationGeneration += 1;
    this.activeOperation?.abort();
    this.activeOperation = null;
    this.authorityKey = null;
    this.publish({ kind: "idle" });
  }

  private start(authorityKey: string, snapshot: MobileHomeSnapshot): number {
    this.operationGeneration += 1;
    this.activeOperation?.abort();
    this.activeOperation = new AbortController();
    this.authorityKey = authorityKey;
    this.publish(snapshot);
    return this.operationGeneration;
  }

  private isCurrent(generation: number, authorityKey: string): boolean {
    return (
      generation === this.operationGeneration &&
      authorityKey === this.authorityKey
    );
  }

  private publish(snapshot: MobileHomeSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
