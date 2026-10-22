import { ApiRequestError } from "@/services/api/client";

import type { QaActivityCalendar } from "./qa-activity-calendar-api";

export interface QaActivityCalendarApi {
  get(signal?: AbortSignal): Promise<QaActivityCalendar>;
}

export type QaActivityCalendarSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "ready";
      authorityKey: string;
      calendar: QaActivityCalendar;
    }
  | {
      kind: "error";
      authorityKey: string;
      message: string;
      retryable: boolean;
    };

function failure(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof ApiRequestError) {
    if (error.code === "QA_ACTIVITY_CALENDAR_UNAVAILABLE") {
      return {
        message: "No pudimos validar el calendario de actividad Q&A.",
        retryable: false,
      };
    }
    if (error.kind === "offline") {
      return {
        message: "No hay conexión. Volvé a intentarlo cuando estés en línea.",
        retryable: true,
      };
    }
    if (error.kind === "timeout") {
      return {
        message: "El calendario de actividad tardó demasiado.",
        retryable: true,
      };
    }
    if (error.status === 401) {
      return {
        message: "Tu sesión venció. Iniciá sesión nuevamente.",
        retryable: false,
      };
    }
    if (error.status === 403) {
      return {
        message: "No se pudo autorizar el calendario de esta cuenta.",
        retryable: false,
      };
    }
    return {
      message: "El calendario de actividad Q&A no está disponible ahora.",
      retryable: error.status === null || error.status >= 500,
    };
  }
  return {
    message: "No pudimos cargar el calendario de actividad Q&A.",
    retryable: true,
  };
}

export class QaActivityCalendarController {
  private snapshot: QaActivityCalendarSnapshot = { kind: "idle" };
  private readonly listeners = new Set<
    (snapshot: QaActivityCalendarSnapshot) => void
  >();
  private sequence = 0;
  private abortController: AbortController | null = null;

  constructor(private readonly api: QaActivityCalendarApi) {}

  getSnapshot(): QaActivityCalendarSnapshot {
    return this.snapshot;
  }

  subscribe(
    listener: (snapshot: QaActivityCalendarSnapshot) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string): Promise<void> {
    this.abortController?.abort();
    const sequence = ++this.sequence;
    const controller = new AbortController();
    this.abortController = controller;
    this.publish({ kind: "loading", authorityKey });
    try {
      const calendar = await this.api.get(controller.signal);
      if (!this.isCurrent(sequence, controller)) return;
      this.publish({ kind: "ready", authorityKey, calendar });
    } catch (error) {
      if (!this.isCurrent(sequence, controller)) return;
      this.publish({ kind: "error", authorityKey, ...failure(error) });
    } finally {
      if (this.abortController === controller) this.abortController = null;
    }
  }

  close(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.sequence += 1;
    this.publish({ kind: "idle" });
  }

  dispose(): void {
    this.close();
    this.listeners.clear();
  }

  private isCurrent(sequence: number, controller: AbortController) {
    return (
      this.sequence === sequence &&
      !controller.signal.aborted &&
      this.abortController === controller
    );
  }

  private publish(snapshot: QaActivityCalendarSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
