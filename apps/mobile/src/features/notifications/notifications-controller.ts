import {
  communityFailure,
  type CommunityFailure,
} from "@/features/community/community-controller";
import type {
  CommunityNotificationsApi,
  MobileNotificationPage,
  MobileNotificationView,
} from "@/features/community/community-api";

export const MOBILE_NOTIFICATION_PAGE_SIZE = 30;
export const MOBILE_NOTIFICATION_RECONCILE_INTERVAL_MS = 30_000;

export type MobileNotificationsSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string; unreadOnly: boolean }
  | {
      kind: "failure";
      authorityKey: string;
      unreadOnly: boolean;
      failure: CommunityFailure;
    }
  | {
      kind: "ready";
      authorityKey: string;
      unreadOnly: boolean;
      data: MobileNotificationPage;
      loadedPages: number;
      loadingMore: boolean;
      actionBusy: boolean;
      failure: CommunityFailure | null;
    };

type Listener = (snapshot: MobileNotificationsSnapshot) => void;

type ListOperation = {
  authorityKey: string;
  unreadOnly: boolean;
  generation: number;
  controller: AbortController;
};

function appendUniqueNotifications(
  current: MobileNotificationView[],
  next: MobileNotificationView[],
): MobileNotificationView[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}

export function shouldReconcileMobileNotifications(
  isFocused: boolean,
  appState: string,
): boolean {
  return isFocused && appState === "active";
}

export class MobileNotificationsController {
  private snapshot: MobileNotificationsSnapshot = { kind: "idle" };
  private listeners = new Set<Listener>();
  private authorityKey: string | null = null;
  private unreadOnly = false;
  private listGeneration = 0;
  private activeList: ListOperation | null = null;
  private actionGeneration = 0;
  private activeAction: {
    controller: AbortController;
    authorityKey: string;
  } | null = null;

  constructor(private readonly api: CommunityNotificationsApi) {}

  getSnapshot(): MobileNotificationsSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string, unreadOnly: boolean): Promise<void> {
    if (
      this.authorityKey === authorityKey &&
      this.unreadOnly === unreadOnly &&
      this.activeAction
    ) {
      return;
    }
    if (this.authorityKey !== authorityKey || this.unreadOnly !== unreadOnly) {
      this.cancelAction();
    }
    this.authorityKey = authorityKey;
    this.unreadOnly = unreadOnly;
    const operation = this.beginList(authorityKey, unreadOnly);
    this.publish({ kind: "loading", authorityKey, unreadOnly });

    try {
      const data = await this.api.notifications(
        { unreadOnly, limit: MOBILE_NOTIFICATION_PAGE_SIZE },
        operation.controller.signal,
      );
      if (!this.isCurrentList(operation)) return;

      this.publish({
        kind: "ready",
        authorityKey,
        unreadOnly,
        data,
        loadedPages: 1,
        loadingMore: false,
        actionBusy: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrentList(operation)) return;
      this.publish({
        kind: "failure",
        authorityKey,
        unreadOnly,
        failure: communityFailure(error),
      });
    } finally {
      this.finishList(operation);
    }
  }

  async loadMore(authorityKey: string): Promise<void> {
    const current = this.currentReady(authorityKey);
    if (
      !current ||
      !current.data.nextCursor ||
      current.loadingMore ||
      current.actionBusy ||
      this.activeList
    ) {
      return;
    }

    const operation = this.beginList(authorityKey, current.unreadOnly);
    this.publish({ ...current, loadingMore: true, failure: null });

    try {
      const next = await this.api.notifications(
        {
          unreadOnly: current.unreadOnly,
          cursor: current.data.nextCursor,
          limit: MOBILE_NOTIFICATION_PAGE_SIZE,
        },
        operation.controller.signal,
      );
      if (!this.isCurrentList(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (!latest) return;

      this.publish({
        ...latest,
        data: {
          items: appendUniqueNotifications(latest.data.items, next.items),
          nextCursor: next.nextCursor,
        },
        loadedPages: latest.loadedPages + 1,
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrentList(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          loadingMore: false,
          failure: communityFailure(error),
        });
      }
    } finally {
      this.finishList(operation);
    }
  }

  async reconcile(authorityKey: string, reportFailure = false): Promise<void> {
    const current = this.currentReady(authorityKey);
    if (
      !current ||
      current.loadingMore ||
      current.actionBusy ||
      this.activeList
    ) {
      return;
    }

    const operation = this.beginList(authorityKey, current.unreadOnly);
    const items: MobileNotificationView[] = [];
    let cursor: string | undefined;
    let nextCursor: string | null = null;
    let loadedPages = 0;

    try {
      for (let page = 0; page < current.loadedPages; page += 1) {
        const result = await this.api.notifications(
          {
            unreadOnly: current.unreadOnly,
            ...(cursor ? { cursor } : {}),
            limit: MOBILE_NOTIFICATION_PAGE_SIZE,
          },
          operation.controller.signal,
        );
        if (!this.isCurrentList(operation)) return;

        items.push(...result.items);
        loadedPages += 1;
        nextCursor = result.nextCursor;
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }

      if (!this.isCurrentList(operation)) return;
      this.publish({
        ...current,
        data: { items, nextCursor },
        loadedPages,
        failure: null,
      });
    } catch (error) {
      if (!reportFailure || !this.isCurrentList(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (latest) {
        this.publish({ ...latest, failure: communityFailure(error) });
      }
    } finally {
      this.finishList(operation);
    }
  }

  async markRead(authorityKey: string, id: string): Promise<void> {
    await this.runReadAction(authorityKey, (signal) =>
      this.api.markNotificationRead(id, signal),
    );
  }

  async markAllRead(authorityKey: string): Promise<void> {
    await this.runReadAction(authorityKey, (signal) =>
      this.api.markAllNotificationsRead(signal),
    );
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && authorityKey !== this.authorityKey) return;

    this.authorityKey = null;
    this.listGeneration += 1;
    this.activeList?.controller.abort();
    this.activeList = null;
    this.cancelAction();
    this.publish({ kind: "idle" });
  }

  suspend(authorityKey: string): void {
    if (authorityKey !== this.authorityKey) return;

    this.listGeneration += 1;
    this.activeList?.controller.abort();
    this.activeList = null;
    this.cancelAction();

    if (
      this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
    ) {
      this.publish({
        ...this.snapshot,
        loadingMore: false,
        actionBusy: false,
      });
    } else {
      this.publish({ kind: "idle" });
    }
  }

  private async runReadAction(
    authorityKey: string,
    action: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<void> {
    const current = this.currentReady(authorityKey);
    if (!current || current.actionBusy || this.activeAction) return;

    const controller = new AbortController();
    const generation = ++this.actionGeneration;
    this.activeAction = { controller, authorityKey };
    this.publish({ ...current, actionBusy: true, failure: null });
    let succeeded = false;

    try {
      await action(controller.signal);
      if (!this.isCurrentAction(authorityKey, generation, controller)) return;
      succeeded = true;
    } catch (error) {
      if (!this.isCurrentAction(authorityKey, generation, controller)) return;
      const latest = this.currentReady(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          actionBusy: false,
          failure: communityFailure(error),
        });
      }
    } finally {
      if (this.isCurrentAction(authorityKey, generation, controller)) {
        this.activeAction = null;
        const latest = this.currentReady(authorityKey);
        if (latest) this.publish({ ...latest, actionBusy: false });
      }
    }

    if (succeeded && authorityKey === this.authorityKey) {
      await this.reconcile(authorityKey, true);
    }
  }

  private beginList(authorityKey: string, unreadOnly: boolean): ListOperation {
    this.listGeneration += 1;
    this.activeList?.controller.abort();
    const operation: ListOperation = {
      authorityKey,
      unreadOnly,
      generation: this.listGeneration,
      controller: new AbortController(),
    };
    this.activeList = operation;
    return operation;
  }

  private isCurrentList(operation: ListOperation): boolean {
    return (
      this.activeList === operation &&
      operation.generation === this.listGeneration &&
      operation.authorityKey === this.authorityKey &&
      operation.unreadOnly === this.unreadOnly &&
      !operation.controller.signal.aborted
    );
  }

  private finishList(operation: ListOperation): void {
    if (this.activeList !== operation) return;
    this.activeList = null;
  }

  private isCurrentAction(
    authorityKey: string,
    generation: number,
    controller: AbortController,
  ): boolean {
    return (
      this.activeAction?.controller === controller &&
      this.actionGeneration === generation &&
      this.authorityKey === authorityKey &&
      !controller.signal.aborted
    );
  }

  private cancelAction(): void {
    this.actionGeneration += 1;
    this.activeAction?.controller.abort();
    this.activeAction = null;
  }

  private currentReady(
    authorityKey: string,
  ): Extract<MobileNotificationsSnapshot, { kind: "ready" }> | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey &&
      this.snapshot.unreadOnly === this.unreadOnly
      ? this.snapshot
      : null;
  }

  private publish(snapshot: MobileNotificationsSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
