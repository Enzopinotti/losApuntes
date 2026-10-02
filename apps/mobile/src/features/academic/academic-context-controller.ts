import type {
  AcademicAffiliation,
  AcademicCurrentContext,
  AcademicSubjectParticipation,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

import type { AcademicContextApi } from "./academic-api";

export interface AcademicContextData {
  context: AcademicCurrentContext | null;
  affiliations: AcademicAffiliation[];
  participations: AcademicSubjectParticipation[];
  affiliationsTruncated: boolean;
  affiliationLimit: number;
  participationsTruncated: boolean;
  participationLimit: number;
  contextRevision: number;
  contextAuthorityKey: string;
}

export type AcademicContextSnapshot =
  | { kind: "unavailable" }
  | { kind: "loading" }
  | { kind: "switching"; data: AcademicContextData }
  | { kind: "ready"; data: AcademicContextData }
  | { kind: "no_context"; data: AcademicContextData }
  | { kind: "offline" }
  | { kind: "timeout" }
  | { kind: "server_unavailable" }
  | { kind: "error"; code: string | null };

type Listener = (snapshot: AcademicContextSnapshot) => void;

const contextSignature = (context: AcademicCurrentContext | null): string =>
  context
    ? `${context.affiliationId}:${context.subjectParticipationId ?? ""}`
    : "none";

const failureSnapshot = (error: unknown): AcademicContextSnapshot => {
  if (!(error instanceof ApiRequestError)) {
    return { kind: "error", code: null };
  }

  if (error.kind === "offline") return { kind: "offline" };
  if (error.kind === "timeout") return { kind: "timeout" };
  if (error.kind === "server_unavailable") {
    return { kind: "server_unavailable" };
  }

  return { kind: "error", code: error.code };
};

export class AcademicContextController {
  private snapshot: AcademicContextSnapshot = { kind: "unavailable" };
  private listeners = new Set<Listener>();
  private operationGeneration = 0;
  private activeOperation: AbortController | null = null;
  private authorityKey: string | null = null;
  private lastContextSignature: string | null = null;
  private contextRevision = 0;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly api: AcademicContextApi) {}

  getSnapshot(): AcademicContextSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async restore(authorityKey: string): Promise<void> {
    await this.mutationTail;
    await this.restoreNow(authorityKey);
  }

  private async restoreNow(authorityKey: string): Promise<void> {
    const generation = this.start(authorityKey, { kind: "loading" });
    const signal = this.activeOperation?.signal;

    try {
      const [context, affiliations] = await Promise.all([
        this.api.context(signal),
        this.api.affiliations(signal),
      ]);

      if (!this.isCurrent(generation, authorityKey)) return;

      const participations = await this.api.subjects(
        context.context?.affiliationId,
        signal,
      );

      if (!this.isCurrent(generation, authorityKey)) return;

      this.publishData(authorityKey, {
        context: context.context,
        affiliations: affiliations.affiliations,
        participations: participations.participations,
        affiliationsTruncated: affiliations.truncated,
        affiliationLimit: affiliations.limit,
        participationsTruncated: participations.truncated,
        participationLimit: participations.limit,
      });
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return;
      this.publish(failureSnapshot(error));
    }
  }

  async selectAffiliation(
    authorityKey: string,
    affiliationId: string,
  ): Promise<void> {
    return this.enqueueMutation(async () => {
      const current = await this.currentDataForMutation(authorityKey);
      if (!current) return;

      const generation = this.startMutation(authorityKey, current);

      try {
        const result = await this.api.setContext({
          affiliationId,
          expectedRevision: current.context?.revision ?? 0,
        });
        if (!this.isCurrent(generation, authorityKey)) return;

        const participations = await this.api.subjects(
          result.context?.affiliationId,
        );
        if (!this.isCurrent(generation, authorityKey)) return;

        this.publishData(authorityKey, {
          ...current,
          context: result.context,
          participations: participations.participations,
          participationsTruncated: participations.truncated,
          participationLimit: participations.limit,
        });
      } catch (error) {
        await this.handleMutationFailure(authorityKey, generation, error);
      }
    });
  }

  async selectSubject(
    authorityKey: string,
    subjectParticipationId: string | null,
  ): Promise<void> {
    return this.enqueueMutation(async () => {
      const current = await this.currentDataForMutation(authorityKey);
      if (!current || current.context === null) return;

      const generation = this.startMutation(authorityKey, current);
      const input = subjectParticipationId
        ? {
            affiliationId: current.context.affiliationId,
            subjectParticipationId,
            expectedRevision: current.context.revision,
          }
        : {
            affiliationId: current.context.affiliationId,
            expectedRevision: current.context.revision,
          };

      try {
        const result = await this.api.setContext(input);
        if (!this.isCurrent(generation, authorityKey)) return;

        this.publishData(authorityKey, {
          ...current,
          context: result.context,
        });
      } catch (error) {
        await this.handleMutationFailure(authorityKey, generation, error);
      }
    });
  }

  private async currentDataForMutation(
    authorityKey: string,
  ): Promise<AcademicContextData | null> {
    if (this.authorityKey !== authorityKey) return null;

    let current = this.currentData();
    if (current) return current;

    await this.restoreNow(authorityKey);
    current = this.currentData();

    return this.authorityKey === authorityKey ? current : null;
  }

  private async handleMutationFailure(
    authorityKey: string,
    generation: number,
    error: unknown,
  ): Promise<void> {
    if (!this.isCurrent(generation, authorityKey)) return;

    const reconcile =
      error instanceof ApiRequestError &&
      (error.code === "ACADEMIC_CONTEXT_REVISION_CONFLICT" ||
        error.kind === "offline" ||
        error.kind === "timeout" ||
        error.kind === "server_unavailable");

    if (reconcile) {
      await this.restoreNow(authorityKey);
      return;
    }

    this.publish(failureSnapshot(error));
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    const queued = this.mutationTail.then(operation, operation);
    this.mutationTail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  private startMutation(
    authorityKey: string,
    data: AcademicContextData,
  ): number {
    if (this.authorityKey !== authorityKey) {
      this.authorityKey = authorityKey;
      this.lastContextSignature = null;
      this.contextRevision = 0;
    }

    this.operationGeneration += 1;
    this.activeOperation?.abort();
    this.activeOperation = null;
    this.publish({ kind: "switching", data });
    return this.operationGeneration;
  }

  suspend(): void {
    this.operationGeneration += 1;
    this.activeOperation?.abort();
    this.activeOperation = null;
  }

  reset(): void {
    this.suspend();
    this.authorityKey = null;
    this.lastContextSignature = null;
    this.contextRevision = 0;
    this.publish({ kind: "unavailable" });
  }

  private start(
    authorityKey: string,
    snapshot: AcademicContextSnapshot,
  ): number {
    if (this.authorityKey !== authorityKey) {
      this.authorityKey = authorityKey;
      this.lastContextSignature = null;
      this.contextRevision = 0;
    }

    this.operationGeneration += 1;
    this.activeOperation?.abort();
    this.activeOperation = new AbortController();
    this.publish(snapshot);
    return this.operationGeneration;
  }

  private isCurrent(generation: number, authorityKey: string): boolean {
    return (
      generation === this.operationGeneration &&
      authorityKey === this.authorityKey
    );
  }

  private publishData(
    authorityKey: string,
    input: Omit<AcademicContextData, "contextRevision" | "contextAuthorityKey">,
  ): void {
    const signature = contextSignature(input.context);
    if (this.lastContextSignature !== signature) {
      this.contextRevision += 1;
      this.lastContextSignature = signature;
    } else if (this.contextRevision === 0) {
      this.contextRevision = 1;
    }

    const data: AcademicContextData = {
      ...input,
      contextRevision: this.contextRevision,
      contextAuthorityKey: `${authorityKey}:${this.contextRevision}`,
    };

    this.publish(
      input.context ? { kind: "ready", data } : { kind: "no_context", data },
    );
  }

  private currentData(): AcademicContextData | null {
    if (
      this.snapshot.kind === "ready" ||
      this.snapshot.kind === "no_context" ||
      this.snapshot.kind === "switching"
    ) {
      return this.snapshot.data;
    }
    return null;
  }

  private publish(snapshot: AcademicContextSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
