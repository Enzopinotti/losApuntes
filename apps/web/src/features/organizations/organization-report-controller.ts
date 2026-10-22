import {
  validateOrganizationReport,
  type OrganizationReportInput,
  type OrganizationReportReason,
} from "./organization-report-policy.ts";

export type OrganizationReportTargetType = "post" | "event";

export type OrganizationReportApi = {
  reportPost(
    organizationId: string,
    postId: string,
    input: OrganizationReportInput,
    signal?: AbortSignal,
  ): Promise<unknown>;
  reportEvent(
    organizationId: string,
    eventId: string,
    input: OrganizationReportInput,
    signal?: AbortSignal,
  ): Promise<unknown>;
};

export type OrganizationReportSnapshot =
  | { kind: "idle" }
  | {
      kind: "ready";
      scopeKey: string;
      organizationId: string;
      targetType: OrganizationReportTargetType;
      targetId: string;
      sending: boolean;
      outcome: "none" | "confirmed" | "uncertain";
      reason: OrganizationReportReason | null;
      failure: unknown | null;
    };

type ReadySnapshot = Extract<OrganizationReportSnapshot, { kind: "ready" }>;
type Listener = (snapshot: OrganizationReportSnapshot) => void;

type ReportOperation = {
  scopeKey: string;
  organizationId: string;
  targetType: OrganizationReportTargetType;
  targetId: string;
  generation: number;
  controller: AbortController;
};

function isConfirmedReport(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const report = (value as { report?: unknown }).report;
  if (typeof report !== "object" || report === null) return false;
  const result = report as { id?: unknown; status?: unknown };
  return (
    typeof result.id === "string" &&
    result.id.length > 0 &&
    result.status === "pending"
  );
}

function invalidResponseFailure(): Error & { status: number; code: string } {
  return Object.assign(new Error("Invalid organization report response"), {
    status: 200,
    code: "INVALID_RESPONSE",
  });
}

function ambiguousFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return true;

  const value = error as { status?: unknown; code?: unknown };
  if (typeof value.status !== "number") return true;
  return (
    value.status === 0 ||
    value.status === 408 ||
    value.status >= 500 ||
    value.code === "INVALID_RESPONSE"
  );
}

export class OrganizationReportController {
  private snapshot: OrganizationReportSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private generation = 0;
  private active: ReportOperation | null = null;
  private readonly api: OrganizationReportApi;

  constructor(api: OrganizationReportApi) {
    this.api = api;
  }

  getSnapshot(): OrganizationReportSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setTarget(
    scopeKey: string,
    organizationId: string,
    targetType: OrganizationReportTargetType,
    targetId: string,
  ): void {
    if (this.current(scopeKey, organizationId, targetType, targetId)) return;
    this.abort();
    this.publish({
      kind: "ready",
      scopeKey,
      organizationId,
      targetType,
      targetId,
      sending: false,
      outcome: "none",
      reason: null,
      failure: null,
    });
  }

  async submit(
    scopeKey: string,
    organizationId: string,
    targetType: OrganizationReportTargetType,
    targetId: string,
    reason: OrganizationReportReason | null,
    details: string,
  ): Promise<boolean> {
    const current = this.current(
      scopeKey,
      organizationId,
      targetType,
      targetId,
    );
    const validation = validateOrganizationReport(reason, details);
    if (
      !current ||
      current.sending ||
      current.outcome !== "none" ||
      validation.kind !== "valid"
    ) {
      return false;
    }

    const operation: ReportOperation = {
      scopeKey,
      organizationId,
      targetType,
      targetId,
      generation: ++this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    this.publish({
      ...current,
      sending: true,
      reason: validation.input.reason,
      failure: null,
    });

    try {
      let response: unknown;
      if (targetType === "post") {
        response = await this.api.reportPost(
          organizationId,
          targetId,
          validation.input,
          operation.controller.signal,
        );
      } else {
        response = await this.api.reportEvent(
          organizationId,
          targetId,
          validation.input,
          operation.controller.signal,
        );
      }
      if (!this.isCurrent(operation)) return false;
      if (!isConfirmedReport(response)) throw invalidResponseFailure();
      const latest = this.current(
        scopeKey,
        organizationId,
        targetType,
        targetId,
      );
      if (!latest) return false;
      this.publish({ ...latest, outcome: "confirmed", failure: null });
      return true;
    } catch (error) {
      if (!this.isCurrent(operation)) return false;
      const latest = this.current(
        scopeKey,
        organizationId,
        targetType,
        targetId,
      );
      if (!latest) return false;
      this.publish({
        ...latest,
        outcome: ambiguousFailure(error) ? "uncertain" : "none",
        failure: error,
      });
      return false;
    } finally {
      if (this.active === operation) {
        this.active = null;
        const latest = this.current(
          scopeKey,
          organizationId,
          targetType,
          targetId,
        );
        if (latest) this.publish({ ...latest, sending: false });
      }
    }
  }

  invalidate(scopeKey?: string): void {
    if (
      scopeKey &&
      this.snapshot.kind === "ready" &&
      this.snapshot.scopeKey !== scopeKey
    ) {
      return;
    }
    this.abort();
    this.publish({ kind: "idle" });
  }

  private current(
    scopeKey: string,
    organizationId: string,
    targetType: OrganizationReportTargetType,
    targetId: string,
  ): ReadySnapshot | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.scopeKey === scopeKey &&
      this.snapshot.organizationId === organizationId &&
      this.snapshot.targetType === targetType &&
      this.snapshot.targetId === targetId
      ? this.snapshot
      : null;
  }

  private isCurrent(operation: ReportOperation): boolean {
    return (
      this.active === operation &&
      this.generation === operation.generation &&
      !operation.controller.signal.aborted &&
      this.current(
        operation.scopeKey,
        operation.organizationId,
        operation.targetType,
        operation.targetId,
      ) !== null
    );
  }

  private abort(): void {
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
  }

  private publish(snapshot: OrganizationReportSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
