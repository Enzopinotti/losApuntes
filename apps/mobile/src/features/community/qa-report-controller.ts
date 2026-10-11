import type {
  CreateQaReportInput,
  QaReportTargetType,
  QaReportView,
} from "@losapuntes/contracts/social-qa";

import {
  communityFailure,
  type CommunityFailure,
} from "./community-controller";
import type { CommunityQaReportsApi } from "./community-api";

export type QaReportSnapshot =
  | { kind: "idle" }
  | {
      kind: "ready";
      authorityKey: string;
      targetType: QaReportTargetType;
      targetId: string;
      busy: boolean;
      report: QaReportView | null;
      failure: CommunityFailure | null;
    };

type Operation = {
  authorityKey: string;
  targetType: QaReportTargetType;
  targetId: string;
  generation: number;
  controller: AbortController;
};

type Listener = (snapshot: QaReportSnapshot) => void;

export function normalizeQaReportInput(
  input: CreateQaReportInput,
): CreateQaReportInput | null {
  const details = input.details?.trim();
  if (details && (details.length < 3 || details.length > 1500)) return null;
  return details ? { reason: input.reason, details } : { reason: input.reason };
}

export class QaReportController {
  private authorityKey: string | null = null;
  private targetType: QaReportTargetType | null = null;
  private targetId: string | null = null;
  private generation = 0;
  private operation: Operation | null = null;
  private snapshot: QaReportSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();

  constructor(private readonly api: CommunityQaReportsApi) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): QaReportSnapshot {
    return this.snapshot;
  }

  setAuthority(
    authorityKey: string | null,
    targetType: QaReportTargetType,
    targetId: string,
  ): void {
    if (
      this.authorityKey === authorityKey &&
      this.targetType === targetType &&
      this.targetId === targetId
    ) {
      return;
    }
    this.cancelOperation();
    this.generation += 1;
    this.authorityKey = authorityKey;
    this.targetType = targetType;
    this.targetId = targetId;
    this.publish(
      authorityKey
        ? {
            kind: "ready",
            authorityKey,
            targetType,
            targetId,
            busy: false,
            report: null,
            failure: null,
          }
        : { kind: "idle" },
    );
  }

  async submit(
    authorityKey: string,
    input: CreateQaReportInput,
  ): Promise<void> {
    const current = this.ready(authorityKey);
    const normalizedInput = normalizeQaReportInput(input);
    if (
      !current ||
      !normalizedInput ||
      current.busy ||
      current.report ||
      this.operation
    ) {
      return;
    }

    const operation = this.begin(
      authorityKey,
      current.targetType,
      current.targetId,
    );
    if (!operation) return;
    this.publish({ ...current, busy: true, failure: null });

    try {
      const response =
        operation.targetType === "question"
          ? await this.api.reportQuestion(
              operation.targetId,
              normalizedInput,
              operation.controller.signal,
            )
          : await this.api.reportAnswer(
              operation.targetId,
              normalizedInput,
              operation.controller.signal,
            );
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        busy: false,
        report: response.report,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          busy: false,
          failure: communityFailure(error),
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && this.authorityKey !== authorityKey) return;
    this.cancelOperation();
    this.generation += 1;
    this.authorityKey = null;
    this.targetType = null;
    this.targetId = null;
    this.publish({ kind: "idle" });
  }

  private ready(
    authorityKey: string,
  ): Extract<QaReportSnapshot, { kind: "ready" }> | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
      ? this.snapshot
      : null;
  }

  private begin(
    authorityKey: string,
    targetType: QaReportTargetType,
    targetId: string,
  ): Operation | null {
    if (
      this.authorityKey !== authorityKey ||
      this.targetType !== targetType ||
      this.targetId !== targetId ||
      this.operation
    ) {
      return null;
    }
    const operation: Operation = {
      authorityKey,
      targetType,
      targetId,
      generation: this.generation,
      controller: new AbortController(),
    };
    this.operation = operation;
    return operation;
  }

  private finish(operation: Operation): void {
    if (this.operation === operation) this.operation = null;
  }

  private cancelOperation(): void {
    this.operation?.controller.abort();
    this.operation = null;
  }

  private isCurrent(operation: Operation): boolean {
    return (
      this.operation === operation &&
      this.generation === operation.generation &&
      this.authorityKey === operation.authorityKey &&
      this.targetType === operation.targetType &&
      this.targetId === operation.targetId
    );
  }

  private publish(snapshot: QaReportSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
