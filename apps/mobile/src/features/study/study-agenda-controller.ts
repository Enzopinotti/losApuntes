import { ApiRequestError } from "@/services/api/client";

import type { StudyAgenda } from "./study-agenda-api";

export interface StudyAgendaApi {
  get(signal?: AbortSignal): Promise<StudyAgenda>;
}

export type StudyAgendaSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "ready";
      authorityKey: string;
      agenda: StudyAgenda;
    }
  | {
      kind: "error";
      authorityKey: string;
      message: string;
      retryable: boolean;
    };

function failure(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof ApiRequestError) {
    if (error.code === "STUDY_PROGRESS_NOT_ENABLED") {
      return {
        message:
          "La agenda de estudio todavía no está habilitada en el servidor.",
        retryable: false,
      };
    }
    if (error.code === "STUDY_AGENDA_DATA_UNAVAILABLE") {
      return {
        message: "No pudimos leer los planes guardados. Probá más tarde.",
        retryable: false,
      };
    }
    if (error.status === 503) {
      return {
        message: "La agenda de estudio no está disponible temporalmente.",
        retryable: true,
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
        message: "La agenda tardó demasiado en responder.",
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
        message: "No se pudo autorizar la agenda de esta cuenta.",
        retryable: false,
      };
    }
    return {
      message: error.message || "No pudimos cargar tu agenda de estudio.",
      retryable: error.status === null || error.status >= 500,
    };
  }
  return {
    message: "No pudimos cargar tu agenda de estudio.",
    retryable: true,
  };
}

export class StudyAgendaController {
  private snapshot: StudyAgendaSnapshot = { kind: "idle" };
  private readonly listeners = new Set<
    (snapshot: StudyAgendaSnapshot) => void
  >();
  private sequence = 0;
  private abortController: AbortController | null = null;

  constructor(private readonly api: StudyAgendaApi) {}

  getSnapshot(): StudyAgendaSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: StudyAgendaSnapshot) => void): () => void {
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
      const agenda = await this.api.get(controller.signal);
      if (!this.isCurrent(sequence, controller)) return;
      this.publish({ kind: "ready", authorityKey, agenda });
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

  private publish(snapshot: StudyAgendaSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
