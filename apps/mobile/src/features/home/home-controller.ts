import type {
  AcademicCurrentContext,
  AcademicFeedResponse,
  ForYouFeedResponse,
  FeedItem,
  FeedPageResponse,
  PilotHomeResponse,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

export interface PilotHomeApi {
  pilotHome(signal?: AbortSignal): Promise<PilotHomeResponse>;
  academicFeed(
    cursor: string,
    signal?: AbortSignal,
  ): Promise<AcademicFeedResponse>;
  forYouFeed(
    cursor: string,
    mode: "balanced" | "community",
    signal?: AbortSignal,
  ): Promise<ForYouFeedResponse>;
}

export type HomeFeedSection = "home" | "for_you";

export interface HomePageStatus {
  loading: boolean;
  error: string | null;
  requiresRefresh: boolean;
}

export const MAX_HOME_FEED_ITEMS = 48;
export const HOME_FEED_PAGE_SIZE = 6;
export const HOME_FEED_PREFETCH_DISTANCE = 480;

export interface HomeFeedScrollMetrics {
  offsetY: number;
  viewportHeight: number;
  contentHeight: number;
}

export function canLoadMoreHomeFeed(
  feed: Pick<FeedPageResponse, "items" | "nextCursor">,
): boolean {
  return Boolean(
    feed.nextCursor &&
    feed.items.length <= MAX_HOME_FEED_ITEMS - HOME_FEED_PAGE_SIZE,
  );
}

export function shouldAutomaticallyLoadHomeFeed(
  feed: Pick<FeedPageResponse, "items" | "nextCursor" | "stopReason">,
  scroll: HomeFeedScrollMetrics,
  status?: HomePageStatus,
): boolean {
  if (
    !canLoadMoreHomeFeed(feed) ||
    feed.stopReason === "natural_break" ||
    status?.loading ||
    status?.error ||
    status?.requiresRefresh ||
    !Number.isFinite(scroll.offsetY) ||
    !Number.isFinite(scroll.viewportHeight) ||
    !Number.isFinite(scroll.contentHeight) ||
    scroll.offsetY < 0 ||
    scroll.viewportHeight <= 0 ||
    scroll.contentHeight <= 0
  ) {
    return false;
  }

  const distanceFromEnd =
    scroll.contentHeight - scroll.offsetY - scroll.viewportHeight;
  return distanceFromEnd <= HOME_FEED_PREFETCH_DISTANCE;
}

function dedupeFeedItems(
  existing: FeedItem[],
  incoming: FeedItem[],
): FeedItem[] {
  const seen = new Set(existing.map((item) => `${item.type}:${item.id}`));
  const result = [...existing];
  for (const item of incoming) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (result.length === MAX_HOME_FEED_ITEMS) break;
    result.push(item);
  }
  return result;
}

function needsHomeRefresh(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.kind === "conflict" ||
      error.kind === "gone" ||
      error.kind === "unauthorized" ||
      error.kind === "forbidden")
  );
}

function moreFailureMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "HOME_FEED_CURSOR_CYCLE") {
      return "El feed volvió a una página anterior. Actualizá Inicio para recibir una tanda nueva.";
    }
    if (error.kind === "conflict" || error.kind === "gone") {
      return "La selección cambió. Actualizá Inicio para recibir una nueva tanda.";
    }
    if (error.kind === "offline" || error.kind === "timeout") {
      return "Se interrumpió la conexión. Podés reintentar sin perder lo cargado.";
    }
    if (error.kind === "unauthorized" || error.kind === "forbidden") {
      return "No pudimos revalidar tu acceso. Actualizá Inicio.";
    }
  }
  return "No se pudo cargar la siguiente tanda. Podés reintentar.";
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
      pagination?: Partial<Record<HomeFeedSection, HomePageStatus>>;
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
  private moreOperations: Record<HomeFeedSection, AbortController | null> = {
    home: null,
    for_you: null,
  };
  private consumedCursors: Record<HomeFeedSection, Set<string>> = {
    home: new Set(),
    for_you: new Set(),
  };

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

  async loadMore(
    authorityKey: string,
    section: HomeFeedSection,
  ): Promise<void> {
    const initial = this.snapshot;
    if (
      initial.kind !== "ready" ||
      initial.authorityKey !== authorityKey ||
      this.authorityKey !== authorityKey ||
      this.moreOperations[section] ||
      initial.pagination?.[section]?.requiresRefresh
    ) {
      return;
    }

    const initialFeed =
      section === "home" ? initial.data.homeFeed : initial.data.forYou;
    const cursor = initialFeed.nextCursor;
    if (!cursor || !canLoadMoreHomeFeed(initialFeed)) return;

    const generation = this.operationGeneration;
    const operation = new AbortController();
    this.moreOperations[section] = operation;
    this.publish({
      ...initial,
      pagination: {
        ...initial.pagination,
        [section]: { loading: true, error: null, requiresRefresh: false },
      },
    });

    const stillCurrent = () =>
      this.isCurrent(generation, authorityKey) &&
      this.moreOperations[section] === operation &&
      this.snapshot.kind === "ready";

    try {
      const mode =
        section === "home" && initial.data.homeFeed.kind === "community"
          ? "community"
          : "balanced";
      const page =
        section === "home" && mode === "balanced"
          ? await this.api.academicFeed(cursor, operation.signal)
          : await this.api.forYouFeed(cursor, mode, operation.signal);
      if (!stillCurrent()) return;

      const current = this.snapshot;
      if (current.kind !== "ready") return;
      if (
        section === "home" &&
        mode === "balanced" &&
        "context" in page &&
        JSON.stringify(page.context.subjectIds) !==
          JSON.stringify(current.data.academicFeed.context.subjectIds)
      ) {
        throw new ApiRequestError(
          "conflict",
          409,
          "HOME_FEED_CONTEXT_CHANGED",
          "Academic feed subject scope changed",
        );
      }

      const currentFeed =
        section === "home" ? current.data.homeFeed : current.data.forYou;
      if (currentFeed.nextCursor !== cursor) return;

      if (page.items.length > HOME_FEED_PAGE_SIZE) {
        throw new Error("Home feed page exceeds the server page limit");
      }
      const consumedCursors = this.consumedCursors[section];
      consumedCursors.add(cursor);
      if (page.nextCursor && consumedCursors.has(page.nextCursor)) {
        throw new ApiRequestError(
          "conflict",
          409,
          "HOME_FEED_CURSOR_CYCLE",
          "Home feed returned a previously consumed cursor",
        );
      }
      const items = dedupeFeedItems(currentFeed.items, page.items);
      const updatedData: PilotHomeResponse =
        section === "home"
          ? {
              ...current.data,
              homeFeed: {
                ...current.data.homeFeed,
                items,
                nextCursor: page.nextCursor,
                stopReason: page.stopReason,
              },
            }
          : {
              ...current.data,
              forYou: {
                ...current.data.forYou,
                items,
                nextCursor: page.nextCursor,
                stopReason: page.stopReason,
                ...("effectiveSignals" in page
                  ? { effectiveSignals: page.effectiveSignals }
                  : {}),
              },
            };
      this.publish({
        ...current,
        data: updatedData,
        pagination: {
          ...current.pagination,
          [section]: { loading: false, error: null, requiresRefresh: false },
        },
      });
    } catch (error) {
      if (!stillCurrent()) return;
      const current = this.snapshot;
      if (current.kind !== "ready") return;
      this.publish({
        ...current,
        pagination: {
          ...current.pagination,
          [section]: {
            loading: false,
            error: moreFailureMessage(error),
            requiresRefresh: needsHomeRefresh(error),
          },
        },
      });
    } finally {
      if (this.moreOperations[section] === operation) {
        this.moreOperations[section] = null;
      }
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && this.authorityKey !== authorityKey) return;

    this.operationGeneration += 1;
    this.abortMore();
    this.activeOperation?.abort();
    this.activeOperation = null;
    this.authorityKey = null;
    this.resetConsumedCursors();
    this.publish({ kind: "idle" });
  }

  private abortMore(): void {
    for (const section of ["home", "for_you"] as const) {
      this.moreOperations[section]?.abort();
      this.moreOperations[section] = null;
    }
  }

  private start(authorityKey: string, snapshot: MobileHomeSnapshot): number {
    this.operationGeneration += 1;
    this.abortMore();
    this.resetConsumedCursors();
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

  private resetConsumedCursors(): void {
    this.consumedCursors.home.clear();
    this.consumedCursors.for_you.clear();
  }

  private publish(snapshot: MobileHomeSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
