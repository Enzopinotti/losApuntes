import { ApiRequestError } from "@/services/api/client";

import type {
  StudyCollection,
  StudyCollectionPage,
} from "./study-collections-api";

export interface ResourceCollectionPickerApi {
  list(cursor?: string, signal?: AbortSignal): Promise<StudyCollectionPage>;
  add(
    collectionId: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<{ collection: StudyCollection }>;
}

export type ResourceCollectionPickerSnapshot =
  | { kind: "idle" }
  | {
      kind: "loading";
      authorityKey: string;
      resourceId: string;
    }
  | {
      kind: "ready";
      authorityKey: string;
      resourceId: string;
      items: StudyCollection[];
      nextCursor: string | null;
      loadingMore: boolean;
      busyCollectionId: string | null;
      savedCollectionIds: string[];
      error: string | null;
      notice: string | null;
    };

function mergeById(
  current: StudyCollection[],
  incoming: StudyCollection[],
): StudyCollection[] {
  return Array.from(
    new Map([...current, ...incoming].map((item) => [item.id, item])).values(),
  );
}

const repeatedCursorMessage =
  "El servidor repitió una página de colecciones. Cerrá y volvé a abrir el selector para actualizarlo.";

function failureMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (
      error.code === "STUDY_COLLECTIONS_NOT_ENABLED" ||
      error.status === 503
    ) {
      return "Las colecciones sincronizadas todavía no están habilitadas.";
    }
    if (error.code === "STUDY_COLLECTION_FULL") {
      return "Esta colección llegó al máximo de 100 apuntes.";
    }
    if (error.code === "STUDY_COLLECTION_REVISION_CONFLICT") {
      return "La colección cambió en otro dispositivo. Actualizala e intentá de nuevo.";
    }
    if (error.kind === "offline") {
      return "No hay conexión. Volvé a intentarlo cuando estés en línea.";
    }
    if (error.kind === "timeout") {
      return "El servidor tardó demasiado en responder.";
    }
    if (error.status === 401)
      return "Tu sesión venció. Iniciá sesión nuevamente.";
    if (error.status === 403 || error.status === 404) {
      return "El apunte o la colección ya no está disponible.";
    }
    return error.message;
  }
  return "No pudimos completar la operación.";
}

export class ResourceCollectionPickerController {
  private snapshot: ResourceCollectionPickerSnapshot = { kind: "idle" };
  private readonly listeners = new Set<
    (snapshot: ResourceCollectionPickerSnapshot) => void
  >();
  private sequence = 0;
  private abortController: AbortController | null = null;
  private readonly requestedCursors = new Set<string>();

  constructor(private readonly api: ResourceCollectionPickerApi) {}

  getSnapshot(): ResourceCollectionPickerSnapshot {
    return this.snapshot;
  }

  subscribe(
    listener: (snapshot: ResourceCollectionPickerSnapshot) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async open(authorityKey: string, resourceId: string): Promise<void> {
    this.cancelCurrent();
    this.requestedCursors.clear();
    const sequence = ++this.sequence;
    const abortController = new AbortController();
    this.abortController = abortController;
    this.publish({ kind: "loading", authorityKey, resourceId });
    try {
      const page = await this.api.list(undefined, abortController.signal);
      if (!this.isCurrent(sequence, abortController)) return;
      this.publish({
        kind: "ready",
        authorityKey,
        resourceId,
        items: page.items,
        nextCursor: page.nextCursor,
        loadingMore: false,
        busyCollectionId: null,
        savedCollectionIds: [],
        error: null,
        notice: null,
      });
    } catch (error) {
      if (!this.isCurrent(sequence, abortController)) return;
      this.publish({
        kind: "ready",
        authorityKey,
        resourceId,
        items: [],
        nextCursor: null,
        loadingMore: false,
        busyCollectionId: null,
        savedCollectionIds: [],
        error: failureMessage(error),
        notice: null,
      });
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
    }
  }

  async loadMore(): Promise<void> {
    const current = this.snapshot;
    const cursor = current.kind === "ready" ? current.nextCursor : null;
    if (
      current.kind !== "ready" ||
      !cursor ||
      current.loadingMore ||
      current.busyCollectionId
    ) {
      return;
    }

    if (this.requestedCursors.has(cursor)) {
      this.publish({
        ...current,
        nextCursor: null,
        error: repeatedCursorMessage,
      });
      return;
    }
    const sequence = this.sequence;
    const abortController = new AbortController();
    this.abortController = abortController;
    this.publish({ ...current, loadingMore: true, error: null });
    try {
      const page = await this.api.list(cursor, abortController.signal);
      if (!this.isCurrent(sequence, abortController)) return;
      const latest = this.snapshot;
      if (latest.kind !== "ready") return;
      const cursorRepeated =
        page.nextCursor !== null &&
        (page.nextCursor === cursor ||
          this.requestedCursors.has(page.nextCursor));
      this.requestedCursors.add(cursor);
      this.publish({
        ...latest,
        items: mergeById(latest.items, page.items),
        nextCursor: cursorRepeated ? null : page.nextCursor,
        loadingMore: false,
        error: cursorRepeated ? repeatedCursorMessage : null,
      });
    } catch (error) {
      if (!this.isCurrent(sequence, abortController)) return;
      const latest = this.snapshot;
      if (latest.kind === "ready") {
        this.publish({
          ...latest,
          loadingMore: false,
          error: failureMessage(error),
        });
      }
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
    }
  }

  async save(collectionId: string): Promise<void> {
    const current = this.snapshot;
    if (
      current.kind !== "ready" ||
      current.busyCollectionId ||
      current.loadingMore
    ) {
      return;
    }
    const collection = current.items.find((item) => item.id === collectionId);
    if (!collection) return;

    const sequence = this.sequence;
    const abortController = new AbortController();
    this.abortController = abortController;
    this.publish({
      ...current,
      busyCollectionId: collectionId,
      error: null,
      notice: null,
    });
    try {
      const response = await this.api.add(
        collectionId,
        current.resourceId,
        abortController.signal,
      );
      if (!this.isCurrent(sequence, abortController)) return;
      const latest = this.snapshot;
      if (latest.kind !== "ready") return;
      this.publish({
        ...latest,
        items: latest.items.map((item) =>
          item.id === response.collection.id ? response.collection : item,
        ),
        busyCollectionId: null,
        savedCollectionIds: latest.savedCollectionIds.includes(
          response.collection.id,
        )
          ? latest.savedCollectionIds
          : [...latest.savedCollectionIds, response.collection.id],
        error: null,
        notice: `Apunte agregado a “${response.collection.title}”.`,
      });
    } catch (error) {
      if (!this.isCurrent(sequence, abortController)) return;
      const latest = this.snapshot;
      if (latest.kind === "ready") {
        this.publish({
          ...latest,
          busyCollectionId: null,
          error: failureMessage(error),
        });
      }
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
    }
  }

  close(): void {
    this.cancelCurrent();
    this.sequence += 1;
    this.requestedCursors.clear();
    this.publish({ kind: "idle" });
  }

  dispose(): void {
    this.close();
    this.listeners.clear();
  }

  private isCurrent(sequence: number, controller: AbortController): boolean {
    return (
      this.sequence === sequence &&
      !controller.signal.aborted &&
      this.abortController === controller
    );
  }

  private cancelCurrent(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  private publish(snapshot: ResourceCollectionPickerSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
