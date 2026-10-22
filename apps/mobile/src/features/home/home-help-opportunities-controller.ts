import type { HomeHelpOpportunities } from "./home-help-opportunities-api";

export interface HomeHelpOpportunitiesApi {
  list(signal?: AbortSignal): Promise<HomeHelpOpportunities>;
}

export type HomeHelpOpportunitiesSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "ready";
      authorityKey: string;
      data: HomeHelpOpportunities;
    }
  | { kind: "error"; authorityKey: string };

type Operation = {
  authorityKey: string;
  sequence: number;
  controller: AbortController;
};

export class HomeHelpOpportunitiesController {
  private snapshot: HomeHelpOpportunitiesSnapshot = { kind: "idle" };
  private readonly listeners = new Set<
    (snapshot: HomeHelpOpportunitiesSnapshot) => void
  >();
  private sequence = 0;
  private operation: Operation | null = null;

  constructor(private readonly api: HomeHelpOpportunitiesApi) {}

  getSnapshot(): HomeHelpOpportunitiesSnapshot {
    return this.snapshot;
  }

  subscribe(
    listener: (snapshot: HomeHelpOpportunitiesSnapshot) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string): Promise<void> {
    this.cancelOperation();
    const operation: Operation = {
      authorityKey,
      sequence: ++this.sequence,
      controller: new AbortController(),
    };
    this.operation = operation;
    this.publish({ kind: "loading", authorityKey });

    try {
      const data = await this.api.list(operation.controller.signal);
      if (!this.isCurrent(operation)) return;
      this.operation = null;
      this.publish({ kind: "ready", authorityKey, data });
    } catch {
      if (!this.isCurrent(operation)) return;
      this.operation = null;
      this.publish({ kind: "error", authorityKey });
    }
  }

  invalidate(authorityKey?: string): void {
    if (
      authorityKey &&
      this.operation &&
      this.operation.authorityKey !== authorityKey
    ) {
      return;
    }
    this.cancelOperation();
    this.sequence += 1;
    this.publish({ kind: "idle" });
  }

  private cancelOperation(): void {
    this.operation?.controller.abort();
    this.operation = null;
  }

  private isCurrent(operation: Operation): boolean {
    return (
      this.operation === operation &&
      operation.sequence === this.sequence &&
      !operation.controller.signal.aborted
    );
  }

  private publish(snapshot: HomeHelpOpportunitiesSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
