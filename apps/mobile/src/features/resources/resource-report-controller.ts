import {
  resourceConsumptionFailure,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";
import {
  validateResourceReport,
  type ResourceReportInput,
  type ResourceReportReason,
} from "./resource-report-policy";

export interface ResourceReportApi {
  report(
    resourceId: string,
    input: ResourceReportInput,
    signal?: AbortSignal,
  ): Promise<{ report: { id: string; status: string } }>;
}

export type MobileResourceReportSnapshot =
  | { kind: "idle" }
  | {
      kind: "ready";
      authorityKey: string;
      resourceId: string;
      sending: boolean;
      outcome: "none" | "confirmed" | "uncertain";
      failure: ResourceConsumptionFailure | null;
    };

type ReportOperation = {
  authorityKey: string;
  resourceId: string;
  generation: number;
  controller: AbortController;
};

type ReadySnapshot = Extract<MobileResourceReportSnapshot, { kind: "ready" }>;
type Listener = (snapshot: MobileResourceReportSnapshot) => void;

/**
 * The server upserts a pending report; there is no report-status read API.
 * Never claim success or offer a blind retry when POST may have reached it.
 */
export class MobileResourceReportController {
  private snapshot: MobileResourceReportSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private generation = 0;
  private active: ReportOperation | null = null;

  constructor(private readonly api: ResourceReportApi) {}

  getSnapshot(): MobileResourceReportSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setScope(authorityKey: string, resourceId: string): void {
    if (this.current(authorityKey, resourceId)) return;
    this.abort();
    this.publish({
      kind: "ready",
      authorityKey,
      resourceId,
      sending: false,
      outcome: "none",
      failure: null,
    });
  }

  async submit(
    authorityKey: string,
    resourceId: string,
    reason: ResourceReportReason,
    details: string,
  ): Promise<boolean> {
    const current = this.current(authorityKey, resourceId);
    const validated = validateResourceReport(reason, details);
    if (
      !current ||
      current.sending ||
      current.outcome !== "none" ||
      validated.kind !== "valid"
    ) {
      return false;
    }

    const operation: ReportOperation = {
      authorityKey,
      resourceId,
      generation: ++this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    this.publish({ ...current, sending: true, failure: null });

    try {
      await this.api.report(
        resourceId,
        validated.input,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return false;
      this.publish({
        ...this.current(authorityKey, resourceId)!,
        outcome: "confirmed",
        failure: null,
      });
      return true;
    } catch (error) {
      if (!this.isCurrent(operation)) return false;
      const failure = resourceConsumptionFailure(error);
      const outcome =
        failure === "offline" ||
        failure === "timeout" ||
        failure === "server_unavailable"
          ? "uncertain"
          : "none";
      this.publish({
        ...this.current(authorityKey, resourceId)!,
        outcome,
        failure,
      });
      return false;
    } finally {
      if (this.active === operation) {
        this.active = null;
        const latest = this.current(authorityKey, resourceId);
        if (latest) this.publish({ ...latest, sending: false });
      }
    }
  }

  suspend(authorityKey: string): void {
    if (
      this.snapshot.kind !== "ready" ||
      this.snapshot.authorityKey !== authorityKey
    ) {
      return;
    }
    const current = this.snapshot;
    const wasSending = current.sending;
    this.abort();
    this.publish({
      ...current,
      sending: false,
      outcome: wasSending ? "uncertain" : current.outcome,
      failure: null,
    });
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
    resourceId: string,
  ): ReadySnapshot | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey &&
      this.snapshot.resourceId === resourceId
      ? this.snapshot
      : null;
  }

  private isCurrent(operation: ReportOperation): boolean {
    return (
      this.active === operation &&
      this.generation === operation.generation &&
      !operation.controller.signal.aborted &&
      this.current(operation.authorityKey, operation.resourceId) !== null
    );
  }

  private abort(): void {
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
  }

  private publish(snapshot: MobileResourceReportSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
