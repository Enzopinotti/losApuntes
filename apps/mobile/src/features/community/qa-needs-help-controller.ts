import { ApiRequestError } from "@/services/api/client";

import type { QaNeedsHelpApi } from "./qa-needs-help-runtime";
import type { QaNeedsHelpPage, QaNeedsHelpQuestion } from "./qa-needs-help-api";

export type QaNeedsHelpFailure = {
  message: string;
  retryable: boolean;
  restartable: boolean;
};

export type QaNeedsHelpSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string; subjectId: string }
  | {
      kind: "error";
      authorityKey: string;
      subjectId: string;
      failure: QaNeedsHelpFailure;
    }
  | {
      kind: "ready";
      authorityKey: string;
      subjectId: string;
      page: QaNeedsHelpPage;
      loadingMore: boolean;
      loadMoreFailure: QaNeedsHelpFailure | null;
    };

type Operation = {
  authorityKey: string;
  subjectId: string;
  sequence: number;
  controller: AbortController;
};

function failure(error: unknown): QaNeedsHelpFailure {
  if (error instanceof ApiRequestError) {
    if (error.code === "QA_NEEDS_HELP_CURSOR_INVALID") {
      return {
        message: "Este recorrido cambió. Volvé al inicio de las preguntas.",
        retryable: false,
        restartable: true,
      };
    }
    if (error.code === "QA_NEEDS_HELP_UNAVAILABLE") {
      return {
        message: "No pudimos validar las preguntas que necesitan ayuda.",
        retryable: false,
        restartable: false,
      };
    }
    if (error.kind === "offline") {
      return {
        message:
          "No hay conexión. Podés volver a intentarlo cuando estés en línea.",
        retryable: true,
        restartable: false,
      };
    }
    if (error.kind === "timeout") {
      return {
        message: "La búsqueda de preguntas tardó demasiado.",
        retryable: true,
        restartable: false,
      };
    }
    if (error.status === 401) {
      return {
        message: "Tu sesión venció. Iniciá sesión nuevamente.",
        retryable: false,
        restartable: false,
      };
    }
    if (error.status === 403) {
      return {
        message: "La cuenta no puede acceder a estas preguntas.",
        retryable: false,
        restartable: false,
      };
    }
    return {
      message: "La búsqueda de preguntas no está disponible ahora.",
      retryable: error.status === null || error.status >= 500,
      restartable: false,
    };
  }
  return {
    message: "No pudimos cargar las preguntas que necesitan ayuda.",
    retryable: true,
    restartable: false,
  };
}

function unavailable(): ApiRequestError {
  return new ApiRequestError(
    "server_unavailable",
    503,
    "QA_NEEDS_HELP_UNAVAILABLE",
    "Needs-help page order or cursor repeated",
  );
}

function appendUnique(
  current: QaNeedsHelpQuestion[],
  next: QaNeedsHelpQuestion[],
): QaNeedsHelpQuestion[] {
  const seen = new Set(current.map((item) => item.questionId));
  return [...current, ...next.filter((item) => !seen.has(item.questionId))];
}

export class QaNeedsHelpController {
  private snapshot: QaNeedsHelpSnapshot = { kind: "idle" };
  private readonly listeners = new Set<
    (snapshot: QaNeedsHelpSnapshot) => void
  >();
  private sequence = 0;
  private authorityKey: string | null = null;
  private operation: Operation | null = null;
  private readonly requestedCursors = new Set<string>();

  constructor(private readonly api: QaNeedsHelpApi) {}

  getSnapshot(): QaNeedsHelpSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: QaNeedsHelpSnapshot) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async load(authorityKey: string, subjectId: string): Promise<void> {
    const operation = this.begin(authorityKey, subjectId);
    this.requestedCursors.clear();
    this.publish({ kind: "loading", authorityKey, subjectId });
    try {
      const page = await this.api.list(
        subjectId,
        undefined,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "ready",
        authorityKey,
        subjectId,
        page,
        loadingMore: false,
        loadMoreFailure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "error",
        authorityKey,
        subjectId,
        failure: failure(error),
      });
    } finally {
      this.finish(operation);
    }
  }

  async loadMore(authorityKey: string, subjectId: string): Promise<void> {
    const current = this.currentReady(authorityKey, subjectId);
    const cursor = current?.page.nextCursor;
    if (!current || !cursor || current.loadingMore || this.operation) return;
    if (this.requestedCursors.has(cursor)) {
      this.publish({ ...current, loadMoreFailure: failure(unavailable()) });
      return;
    }

    const operation = this.begin(authorityKey, subjectId);
    this.publish({ ...current, loadingMore: true, loadMoreFailure: null });
    try {
      const next = await this.api.list(
        subjectId,
        cursor,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const firstNext = next.items[0];
      const lastCurrent = current.page.items.at(-1);
      const invalidPage =
        (next.nextCursor &&
          (next.nextCursor === cursor ||
            this.requestedCursors.has(next.nextCursor))) ||
        (firstNext &&
          lastCurrent &&
          (firstNext.createdAt < lastCurrent.createdAt ||
            (firstNext.createdAt === lastCurrent.createdAt &&
              firstNext.questionId <= lastCurrent.questionId))) ||
        next.items.some((item) =>
          current.page.items.some(
            (loaded) => loaded.questionId === item.questionId,
          ),
        );
      if (invalidPage) {
        this.requestedCursors.add(cursor);
        throw unavailable();
      }
      this.requestedCursors.add(cursor);
      const latest = this.currentReady(authorityKey, subjectId);
      if (!latest) return;
      this.publish({
        ...latest,
        page: {
          items: appendUnique(latest.page.items, next.items),
          nextCursor: next.nextCursor,
        },
        loadingMore: false,
        loadMoreFailure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      if (
        error instanceof ApiRequestError &&
        error.code === "QA_NEEDS_HELP_CURSOR_INVALID"
      ) {
        this.requestedCursors.add(cursor);
      }
      const latest = this.currentReady(authorityKey, subjectId);
      if (latest) {
        this.publish({
          ...latest,
          loadingMore: false,
          loadMoreFailure: failure(error),
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && this.authorityKey !== authorityKey) return;
    this.authorityKey = null;
    this.sequence += 1;
    this.operation?.controller.abort();
    this.operation = null;
    this.requestedCursors.clear();
    this.publish({ kind: "idle" });
  }

  private begin(authorityKey: string, subjectId: string): Operation {
    this.operation?.controller.abort();
    const operation = {
      authorityKey,
      subjectId,
      sequence: ++this.sequence,
      controller: new AbortController(),
    };
    this.authorityKey = authorityKey;
    this.operation = operation;
    return operation;
  }

  private currentReady(authorityKey: string, subjectId: string) {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey &&
      this.snapshot.subjectId === subjectId
      ? this.snapshot
      : null;
  }

  private isCurrent(operation: Operation) {
    return (
      this.operation === operation &&
      this.sequence === operation.sequence &&
      this.authorityKey === operation.authorityKey &&
      !operation.controller.signal.aborted
    );
  }

  private finish(operation: Operation) {
    if (this.operation === operation) this.operation = null;
  }

  private publish(snapshot: QaNeedsHelpSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
