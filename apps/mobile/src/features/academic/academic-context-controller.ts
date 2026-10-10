import type {
  AcademicAffiliation,
  AcademicCurrentContext,
  AcademicSubjectParticipation,
} from "@losapuntes/contracts";

import { ApiRequestError, type ApiFailureKind } from "@/services/api/client";

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

export type AcademicAffiliationActivationResult =
  | { kind: "selected"; affiliation: AcademicAffiliation }
  | { kind: "reconcile" }
  | { kind: "failed"; failure: ApiFailureKind; code: string | null }
  | { kind: "stale" };

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
  private uncertainInstitutionCreates = new Map<
    string,
    { affiliation?: AcademicAffiliation }
  >();
  private authorityRecoveryNeededFor: string | null = null;
  private authorityRecoveryWaiters = new Set<{
    authorityKey: string;
    resolve: (data: AcademicContextData | null) => void;
  }>();

  constructor(private readonly api: AcademicContextApi) {}

  getSnapshot(): AcademicContextSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async restore(authorityKey: string): Promise<void> {
    if (this.authorityKey !== null && this.authorityKey !== authorityKey) {
      this.resolveAuthorityRecoveryWaiters(this.authorityKey, null);
    }

    if (
      this.authorityRecoveryNeededFor === authorityKey ||
      this.hasAuthorityRecoveryWaiter(authorityKey)
    ) {
      const restored = await this.restoreNow(authorityKey);
      if (restored) await this.mutationTail;
      return;
    }

    await this.mutationTail;
    await this.restoreNow(authorityKey);
  }

  private async restoreNow(authorityKey: string): Promise<boolean> {
    const generation = this.start(authorityKey, { kind: "loading" });
    const signal = this.activeOperation?.signal;

    try {
      const [context, affiliations] = await Promise.all([
        this.api.context(signal),
        this.api.affiliations(signal),
      ]);

      if (!this.isCurrent(generation, authorityKey)) return false;

      const participations = await this.api.subjects(
        context.context?.affiliationId,
        signal,
      );

      if (!this.isCurrent(generation, authorityKey)) return false;

      this.publishData(authorityKey, {
        context: context.context,
        affiliations: affiliations.affiliations,
        participations: participations.participations,
        affiliationsTruncated: affiliations.truncated,
        affiliationLimit: affiliations.limit,
        participationsTruncated: participations.truncated,
        participationLimit: participations.limit,
      });
      return true;
    } catch (error) {
      if (!this.isCurrent(generation, authorityKey)) return false;
      this.publish(failureSnapshot(error));
      return false;
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

  async addInstitutionAffiliation(
    authorityKey: string,
    institutionId: string,
  ): Promise<AcademicAffiliationActivationResult> {
    return this.enqueueMutation(async () => {
      let current = await this.currentDataForMutation(authorityKey);
      if (!current || this.authorityKey !== authorityKey) {
        return { kind: "stale" };
      }

      let generation = this.startMutation(authorityKey, current);
      const pendingKey = JSON.stringify([authorityKey, institutionId]);
      let affiliation = current.affiliations.find(
        (item) =>
          item.institutionId === institutionId && item.status === "active",
      );
      let knownCreatedAffiliation =
        this.uncertainInstitutionCreates.get(pendingKey)?.affiliation;

      if (affiliation) {
        this.uncertainInstitutionCreates.delete(pendingKey);
      } else if (
        !knownCreatedAffiliation &&
        !this.uncertainInstitutionCreates.has(pendingKey) &&
        current.affiliationsTruncated
      ) {
        this.publishData(authorityKey, current);
        return { kind: "reconcile" };
      } else if (
        !knownCreatedAffiliation &&
        this.uncertainInstitutionCreates.has(pendingKey) &&
        current.affiliationsTruncated
      ) {
        this.publishData(authorityKey, current);
        return { kind: "reconcile" };
      } else if (
        !knownCreatedAffiliation &&
        this.uncertainInstitutionCreates.has(pendingKey)
      ) {
        // A complete server inventory confirms an earlier ambiguous POST did
        // not create this affiliation, so a new attempt is safe.
        this.uncertainInstitutionCreates.delete(pendingKey);
      }

      if (!affiliation && !knownCreatedAffiliation) {
        this.uncertainInstitutionCreates.set(pendingKey, {});
        try {
          const created = await this.api.createAffiliation({
            institutionId,
            status: "active",
          });
          if (!this.isCurrent(generation, authorityKey)) {
            return { kind: "stale" };
          }
          knownCreatedAffiliation = created.affiliation;
          this.uncertainInstitutionCreates.set(pendingKey, {
            affiliation: knownCreatedAffiliation,
          });
        } catch (error) {
          if (!this.isCurrent(generation, authorityKey)) {
            return { kind: "stale" };
          }

          const restored = await this.restoreNow(authorityKey);
          if (!restored) return { kind: "reconcile" };
          current = this.currentData();
          if (!current) return { kind: "reconcile" };
          affiliation = current.affiliations.find(
            (item) =>
              item.institutionId === institutionId && item.status === "active",
          );

          if (affiliation) {
            this.uncertainInstitutionCreates.delete(pendingKey);
          } else if (current.affiliationsTruncated) {
            return { kind: "reconcile" };
          } else {
            this.uncertainInstitutionCreates.delete(pendingKey);
            return this.failedAffiliationActivation(error);
          }
        }
      }

      const restored = await this.restoreNow(authorityKey);
      if (!restored) return { kind: "reconcile" };
      current = this.currentData();
      if (!current || this.authorityKey !== authorityKey) {
        return { kind: "stale" };
      }

      affiliation = current.affiliations.find(
        (item) =>
          item.institutionId === institutionId && item.status === "active",
      );
      if (!affiliation && knownCreatedAffiliation) {
        // A successful create response is itself server authority for the ID;
        // context selection is still revalidated by the existing PUT endpoint.
        affiliation = knownCreatedAffiliation;
      }
      if (!affiliation) {
        if (current.affiliationsTruncated) return { kind: "reconcile" };
        this.uncertainInstitutionCreates.delete(pendingKey);
        return {
          kind: "failed",
          failure: "unexpected",
          code: "ACADEMIC_AFFILIATION_NOT_FOUND",
        };
      }

      if (current.context?.affiliationId === affiliation.id) {
        this.uncertainInstitutionCreates.delete(pendingKey);
        return { kind: "selected", affiliation };
      }

      generation = this.startMutation(authorityKey, current);
      try {
        await this.api.setContext({
          affiliationId: affiliation.id,
          expectedRevision: current.context?.revision ?? 0,
        });
        if (!this.isCurrent(generation, authorityKey)) {
          return { kind: "stale" };
        }
      } catch (error) {
        if (!this.isCurrent(generation, authorityKey)) {
          return { kind: "stale" };
        }

        const reconciled = await this.restoreNow(authorityKey);
        if (!reconciled) return { kind: "reconcile" };
        current = this.currentData();
        if (current?.context?.affiliationId === affiliation.id) {
          this.uncertainInstitutionCreates.delete(pendingKey);
          return { kind: "selected", affiliation };
        }
        return this.failedAffiliationActivation(error);
      }

      const contextRestored = await this.restoreNow(authorityKey);
      if (!contextRestored) return { kind: "reconcile" };
      current = this.currentData();
      if (current?.context?.affiliationId !== affiliation.id) {
        return { kind: "reconcile" };
      }

      this.uncertainInstitutionCreates.delete(pendingKey);
      return { kind: "selected", affiliation };
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

    const restored = await this.restoreNow(authorityKey);
    if (this.authorityKey !== authorityKey) return null;

    current = this.currentData();
    if (current) return current;

    if (!restored) {
      this.authorityRecoveryNeededFor = authorityKey;
      return this.waitForAuthorityRecovery(authorityKey);
    }

    return null;
  }

  private waitForAuthorityRecovery(
    authorityKey: string,
  ): Promise<AcademicContextData | null> {
    return new Promise((resolve) => {
      this.authorityRecoveryWaiters.add({ authorityKey, resolve });
    });
  }

  private hasAuthorityRecoveryWaiter(authorityKey: string): boolean {
    return [...this.authorityRecoveryWaiters].some(
      (waiter) => waiter.authorityKey === authorityKey,
    );
  }

  private resolveAuthorityRecoveryWaiters(
    authorityKey: string,
    data: AcademicContextData | null,
  ): void {
    for (const waiter of [...this.authorityRecoveryWaiters]) {
      if (waiter.authorityKey !== authorityKey) continue;
      this.authorityRecoveryWaiters.delete(waiter);
      waiter.resolve(data);
    }

    if (this.authorityRecoveryNeededFor === authorityKey) {
      this.authorityRecoveryNeededFor = null;
    }
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
      const restored = await this.restoreNow(authorityKey);
      if (!restored && this.authorityKey === authorityKey) {
        this.authorityRecoveryNeededFor = authorityKey;
      }
      return;
    }

    this.publish(failureSnapshot(error));
  }

  private failedAffiliationActivation(
    error: unknown,
  ): AcademicAffiliationActivationResult {
    return {
      kind: "failed",
      failure: error instanceof ApiRequestError ? error.kind : "unexpected",
      code: error instanceof ApiRequestError ? error.code : null,
    };
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
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
      if (this.authorityKey !== null) {
        this.resolveAuthorityRecoveryWaiters(this.authorityKey, null);
      }
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
    if (this.authorityKey !== null) {
      this.resolveAuthorityRecoveryWaiters(this.authorityKey, null);
    }
    this.authorityRecoveryNeededFor = null;
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
      if (this.authorityKey !== null) {
        this.resolveAuthorityRecoveryWaiters(this.authorityKey, null);
      }
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
    this.resolveAuthorityRecoveryWaiters(authorityKey, data);
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
