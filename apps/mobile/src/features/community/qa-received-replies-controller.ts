import { ApiRequestError } from "@/services/api/client";

import type { QaReceivedRepliesApi } from "./qa-received-replies-runtime";
import type {
  QaReceivedRepliesPage,
  QaReceivedReply,
} from "./qa-received-replies-api";

export type QaReceivedRepliesFailure = {
  message: string;
  retryable: boolean;
  restartable: boolean;
};

export type QaReceivedRepliesSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "error";
      authorityKey: string;
      failure: QaReceivedRepliesFailure;
    }
  | {
      kind: "ready";
      authorityKey: string;
      page: QaReceivedRepliesPage;
      loadingMore: boolean;
      failure: QaReceivedRepliesFailure | null;
    };

type Operation = {
  authorityKey: string;
  sequence: number;
  controller: AbortController;
};

function failure(error: unknown): QaReceivedRepliesFailure {
  if (error instanceof ApiRequestError) {
    if (error.code === "QA_RECEIVED_REPLIES_CURSOR_INVALID") {
      return {
        message: "Este recorrido ya venció. Volvé al inicio de las respuestas.",
        retryable: false,
        restartable: true,
      };
    }
    if (error.code === "QA_RECEIVED_REPLIES_UNAVAILABLE") {
      return {
        message: "No pudimos validar las respuestas recibidas.",
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
        message: "La bandeja tardó demasiado en responder.",
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
        message: "La cuenta no puede acceder a estas respuestas.",
        retryable: false,
        restartable: false,
      };
    }
    return {
      message: "La bandeja de respuestas no está disponible ahora.",
      retryable: error.status === null || error.status >= 500,
      restartable: false,
    };
  }
  return {
    message: "No pudimos cargar las respuestas recibidas.",
    retryable: true,
    restartable: false,
  };
}

function appendUniqueReplies(
  current: QaReceivedReply[],
  next: QaReceivedReply[],
): QaReceivedReply[] {
  const seen = new Set(current.map((item) => item.answerId));
  return [...current, ...next.filter((item) => !seen.has(item.answerId))];
}

function invalidCursorLoop(): ApiRequestError {
  return new ApiRequestError(
    "server_unavailable",
    503,
    "QA_RECEIVED_REPLIES_UNAVAILABLE",
    "Received replies cursor repeated",
  );
}

export class QaReceivedRepliesController {
  private snapshot: QaReceivedRepliesSnapshot = { kind: "idle" };
  private readonly listeners = new Set<
    (snapshot: QaReceivedRepliesSnapshot) => void
  >();
  private sequence = 0;
  private authorityKey: string | null = null;
  private operation: Operation | null = null;
  private readonly requestedCursors = new Set<string>();

  constructor(private readonly api: QaReceivedRepliesApi) {}

  getSnapshot(): QaReceivedRepliesSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: QaReceivedRepliesSnapshot) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async load(authorityKey: string): Promise<void> {
    const operation = this.begin(authorityKey);
    this.requestedCursors.clear();
    this.publish({ kind: "loading", authorityKey });
    try {
      const page = await this.api.list(undefined, operation.controller.signal);
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "ready",
        authorityKey,
        page,
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      this.publish({ kind: "error", authorityKey, failure: failure(error) });
    } finally {
      this.finish(operation);
    }
  }

  async loadMore(authorityKey: string): Promise<void> {
    const current = this.currentReady(authorityKey);
    const cursor = current?.page.nextCursor;
    if (!current || !cursor || current.loadingMore || this.operation) return;

    if (this.requestedCursors.has(cursor)) {
      this.publish({
        ...current,
        failure: failure(invalidCursorLoop()),
      });
      return;
    }
    const operation = this.begin(authorityKey);
    this.publish({ ...current, loadingMore: true, failure: null });
    try {
      const next = await this.api.list(cursor, operation.controller.signal);
      if (!this.isCurrent(operation)) return;
      if (
        next.nextCursor &&
        (next.nextCursor === cursor ||
          this.requestedCursors.has(next.nextCursor))
      ) {
        throw invalidCursorLoop();
      }
      this.requestedCursors.add(cursor);
      const latest = this.currentReady(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        page: {
          items: appendUniqueReplies(latest.page.items, next.items),
          nextCursor: next.nextCursor,
        },
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          loadingMore: false,
          failure: failure(error),
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

  private begin(authorityKey: string): Operation {
    this.operation?.controller.abort();
    const operation = {
      authorityKey,
      sequence: ++this.sequence,
      controller: new AbortController(),
    };
    this.authorityKey = authorityKey;
    this.operation = operation;
    return operation;
  }

  private currentReady(authorityKey: string) {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
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

  private publish(snapshot: QaReceivedRepliesSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
