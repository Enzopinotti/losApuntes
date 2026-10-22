import type { MobileOrganizationsApiContract } from "./organizations-api";
import {
  mobileOrganizationsFailure,
  type MobileOrganizationsFailure,
} from "./organizations-controller";
import {
  validateOrganizationReport,
  type OrganizationReportInput,
  type OrganizationReportReason,
} from "./organization-report-policy";

export type OrganizationReportTargetType = "post" | "event";

export type MobileOrganizationReportSnapshot =
  | { kind: "idle" }
  | {
      kind: "ready";
      authorityKey: string;
      organizationId: string;
      targetType: OrganizationReportTargetType;
      targetId: string;
      sending: boolean;
      outcome: "none" | "confirmed" | "uncertain";
      reason: OrganizationReportReason | null;
      failure: MobileOrganizationsFailure | null;
    };

type ReportOperation = {
  authorityKey: string;
  organizationId: string;
  targetType: OrganizationReportTargetType;
  targetId: string;
  generation: number;
  controller: AbortController;
};

type ReadySnapshot = Extract<
  MobileOrganizationReportSnapshot,
  { kind: "ready" }
>;
type Listener = (snapshot: MobileOrganizationReportSnapshot) => void;

function ambiguous(failure: MobileOrganizationsFailure): boolean {
  return (
    failure.kind === "offline" ||
    failure.kind === "timeout" ||
    failure.kind === "server_unavailable"
  );
}

export class MobileOrganizationReportController {
  private snapshot: MobileOrganizationReportSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private generation = 0;
  private active: ReportOperation | null = null;

  constructor(private readonly api: MobileOrganizationsApiContract) {}

  getSnapshot(): MobileOrganizationReportSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setTarget(
    authorityKey: string,
    organizationId: string,
    targetType: OrganizationReportTargetType,
    targetId: string,
  ): void {
    if (this.current(authorityKey, organizationId, targetType, targetId)) {
      return;
    }
    this.abort();
    this.publish({
      kind: "ready",
      authorityKey,
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
    authorityKey: string,
    organizationId: string,
    targetType: OrganizationReportTargetType,
    targetId: string,
    input: OrganizationReportInput,
  ): Promise<boolean> {
    const current = this.current(
      authorityKey,
      organizationId,
      targetType,
      targetId,
    );
    const validation = validateOrganizationReport(
      input.reason,
      input.details ?? "",
    );
    if (
      !current ||
      current.sending ||
      current.outcome !== "none" ||
      validation.kind !== "valid"
    ) {
      return false;
    }

    const operation: ReportOperation = {
      authorityKey,
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
      if (targetType === "post") {
        await this.api.reportPost(
          organizationId,
          targetId,
          validation.input,
          operation.controller.signal,
        );
      } else {
        await this.api.reportEvent(
          organizationId,
          targetId,
          validation.input,
          operation.controller.signal,
        );
      }
      if (!this.isCurrent(operation)) return false;
      const latest = this.current(
        authorityKey,
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
        authorityKey,
        organizationId,
        targetType,
        targetId,
      );
      if (!latest) return false;
      const failure = mobileOrganizationsFailure(error);
      this.publish({
        ...latest,
        outcome: ambiguous(failure) ? "uncertain" : "none",
        failure,
      });
      return false;
    } finally {
      if (this.active === operation) {
        this.active = null;
        const latest = this.current(
          authorityKey,
          organizationId,
          targetType,
          targetId,
        );
        if (latest) this.publish({ ...latest, sending: false });
      }
    }
  }

  invalidate(authorityKey?: string): void {
    if (
      authorityKey &&
      this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey !== authorityKey
    ) {
      return;
    }
    this.abort();
    this.publish({ kind: "idle" });
  }

  private current(
    authorityKey: string,
    organizationId: string,
    targetType: OrganizationReportTargetType,
    targetId: string,
  ): ReadySnapshot | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey &&
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
        operation.authorityKey,
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

  private publish(snapshot: MobileOrganizationReportSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
