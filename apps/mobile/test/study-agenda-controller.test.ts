import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError } from "../src/services/api/client";
import type { StudyAgenda } from "../src/features/study/study-agenda-api";
import {
  StudyAgendaController,
  type StudyAgendaApi,
} from "../src/features/study/study-agenda-controller";
import { formatStudyAgendaLocalTime } from "../src/features/study/study-agenda-presentation";

const agenda: StudyAgenda = {
  scheduled: [
    {
      subjectId: "subject-a",
      revision: 3,
      updatedAt: "2026-10-22T12:00:00.000Z",
      title: "Preparar el parcial",
      startsAt: "2026-10-23T21:30",
      tasks: { total: 2, completed: 1, pending: 1 },
      minutes: { planned: 75, completed: 30, remaining: 45 },
    },
  ],
  unscheduled: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup(overrides: Partial<StudyAgendaApi> = {}) {
  const calls: AbortSignal[] = [];
  const api: StudyAgendaApi = {
    get: async (signal) => {
      if (signal) calls.push(signal);
      return agenda;
    },
    ...overrides,
  };
  return { controller: new StudyAgendaController(api), calls };
}

test("loading exposes the owner-scoped server summary without shifting its local time", async () => {
  const { controller, calls } = setup();
  await controller.load("user:session");
  const snapshot = controller.getSnapshot();
  assert.equal(calls.length, 1);
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.authorityKey, "user:session");
    assert.equal(snapshot.agenda.scheduled[0]?.startsAt, "2026-10-23T21:30");
    assert.equal(snapshot.agenda.scheduled[0]?.minutes.remaining, 45);
  }
});

test("closing fences late data and aborts the pending request", async () => {
  const pending = deferred<StudyAgenda>();
  let signal: AbortSignal | undefined;
  const { controller } = setup({
    get: async (requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    },
  });
  const loading = controller.load("user:session");
  controller.close();
  pending.resolve(agenda);
  await loading;
  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), { kind: "idle" });
});

test("disabled study progress reports an unavailable state without a retry loop", async () => {
  const { controller } = setup({
    get: async () => {
      throw new ApiRequestError(
        "server_unavailable",
        503,
        "STUDY_PROGRESS_NOT_ENABLED",
        "disabled",
      );
    },
  });
  await controller.load("user:session");
  assert.deepEqual(controller.getSnapshot(), {
    kind: "error",
    authorityKey: "user:session",
    message: "La agenda de estudio todavía no está habilitada en el servidor.",
    retryable: false,
  });
});

test("corrupt stored plans do not masquerade as an empty agenda", async () => {
  const { controller } = setup({
    get: async () => {
      throw new ApiRequestError(
        "server_unavailable",
        503,
        "STUDY_AGENDA_DATA_UNAVAILABLE",
        "invalid saved plan",
      );
    },
  });
  await controller.load("user:session");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "error");
  if (snapshot.kind === "error") {
    assert.match(snapshot.message, /No pudimos leer los planes guardados/u);
    assert.equal(snapshot.retryable, false);
  }
});

test("offline agenda errors remain retryable", async () => {
  const { controller } = setup({
    get: async () => {
      throw new ApiRequestError("offline", null, "NETWORK_OFFLINE", "offline");
    },
  });
  await controller.load("user:session");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "error");
  if (snapshot.kind === "error") {
    assert.equal(snapshot.retryable, true);
    assert.match(snapshot.message, /No hay conexión/u);
  }
});

test("local schedule time formatting never converts a wall clock into UTC", () => {
  assert.equal(
    formatStudyAgendaLocalTime("2026-10-23T21:30"),
    "23/10/2026 · 21:30",
  );
  assert.equal(formatStudyAgendaLocalTime("horario legado"), "horario legado");
});
