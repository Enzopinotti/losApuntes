import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type { ContextualDiscoveryResponse } from "../features/search/interfaces";
import {
  isSearchApiError,
  searchApi,
} from "../features/search/services/searchService";
import {
  isResourcesApiError,
  resourcesApi,
} from "../features/resources/services/resourcesService";
import {
  communityApi,
  isCommunityApiError,
} from "../features/community/services/communityService";
import {
  readStudySession,
  normalizeStudySession,
  serializeStudySession,
  type StudySession,
  type StudySessionTask,
} from "../features/study/study-session-plan.mjs";
import { recallStudyDraft } from "../features/study/study-session-draft.mjs";
import { verifyStudyTaskLabels } from "../features/study/study-task-verification.mjs";
import { STUDY_PROGRESS_VISIBLE } from "../features/study/studyProgressFlags";
import {
  isStudyProgressApiError,
  studyProgressApi,
} from "../features/study/studyProgressApi";
import { createStudyHandoff } from "../features/study/study-session-handoff.mjs";
import {
  buildReviewSession,
  reviewCandidates,
  summarizeReviews,
  updateReviewMarks,
  type ReviewMark,
  type ReviewMarks,
  type ReviewMode,
} from "../features/study/study-review-queue.mjs";
import {
  createTaskClock,
  remainingTaskClock,
  pauseTaskClock,
  startTaskClock,
  runSummary,
  updateRunTask,
  type TaskClock,
} from "../features/study/study-session-run-clock.mjs";
import {
  resolveStudySubject,
  studySubjectSelectionFromParams,
  studySubjectHref,
} from "../features/study/study-subject-navigation.mjs";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import StudyRunnerShortcuts from "./StudyRunnerShortcuts";
import "./StudyRunner.scss";

type Context = {
  scope: string;
  loading: boolean;
  data: ContextualDiscoveryResponse | null;
  error: string | null;
};
type Runner = {
  scope: string;
  plan: StudySession;
  labels: Record<string, string | null>;
  clocks: Record<string, TaskClock>;
  reviews: ReviewMarks;
  index: number;
};
type Notice = { scope: string; text: string; error: boolean };
type RemoteSnapshot = {
  scope: string;
  revision: number;
  plan: StudySession | null;
  updatedAt: string | null;
};
type Busy = {
  scope: string;
  kind: "load" | "confirm" | "review";
  key?: string;
};

function keyOf(task: Pick<StudySessionTask, "kind" | "id">): string {
  return task.kind + ":" + task.id;
}

function errorText(error: unknown): string {
  if (isStudyProgressApiError(error)) {
    if (error.status === 409) {
      return "El progreso cambió en otro dispositivo. No se sobrescribió nada. Consultá nuevamente antes de guardar.";
    }
    if (error.status === 503) {
      return "La sincronización todavía no está habilitada en el servidor.";
    }
    if (error.status === 401 || error.status === 403) {
      return "Tu sesión no puede acceder a este guardado.";
    }
    return error.message;
  }
  if (
    isResourcesApiError(error) ||
    isCommunityApiError(error) ||
    isSearchApiError(error)
  ) {
    if (error.status === 401) return "La sesión de tu cuenta venció.";
    if (error.status === 403 || error.status === 404) {
      return "El contenido dejó de estar disponible.";
    }
    return error.message;
  }
  if (error instanceof Error && error.message.startsWith("STUDY_SESSION_")) {
    return "Archivo de sesión inválido o incompatible. Exportalo nuevamente desde el Planificador.";
  }
  return "No se pudo verificar el contenido. Revisá la conexión y reintentá.";
}

async function verifiedTaskLabel(
  plan: StudySession,
  task: StudySessionTask,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    if (task.kind === "resource") {
      const response = await resourcesApi.get(task.id, signal);
      return response.resource.academic.subject.id === plan.subjectId
        ? response.resource.title
        : null;
    }
    const response = await communityApi.question(task.id, signal);
    return response.question.academic.subject.id === plan.subjectId
      ? response.question.title
      : null;
  } catch (error) {
    if (
      (isResourcesApiError(error) || isCommunityApiError(error)) &&
      (error.status === 403 || error.status === 404)
    )
      return null;
    throw error;
  }
}

function downloadPlan(
  plan: StudySession,
  filename = "los-apuntes-sesion-actualizada.json",
) {
  const content = serializeStudySession(plan);
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clockText(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  return (
    String(Math.floor(seconds / 60)).padStart(2, "0") +
    ":" +
    String(seconds % 60).padStart(2, "0")
  );
}

export default function StudyRunner() {
  const { status, user, session } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const selection = studySubjectSelectionFromParams(params);
  const authScope = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "none",
  ].join(":");
  const [contextState, setContextState] = useState<Context | null>(null);
  const context = contextState?.scope === authScope ? contextState : null;
  const resolution = context?.data
    ? resolveStudySubject(selection, context.data.subjects)
    : null;
  const subject =
    selection.kind === "selected" && resolution?.kind === "ready"
      ? resolution.subject
      : null;
  const subjectId = subject?.id ?? null;
  const scope = authScope + ":" + (subjectId ?? "none");

  const [runnerState, setRunnerState] = useState<Runner | null>(null);
  const runner = runnerState?.scope === scope ? runnerState : null;
  const task = runner?.plan.tasks[runner.index] ?? null;
  const activeKey = task ? keyOf(task) : null;
  const label = activeKey ? (runner?.labels[activeKey] ?? null) : null;
  const activeClock = activeKey ? (runner?.clocks[activeKey] ?? null) : null;
  const activeClockStartedAt = activeClock?.startedAt ?? null;
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = activeClock ? remainingTaskClock(activeClock, now) : 0;
  const stats = runner ? runSummary(runner.plan) : null;
  const [reviewModeState, setReviewModeState] = useState<{
    scope: string;
    mode: ReviewMode;
  } | null>(null);
  const reviewMode: ReviewMode =
    reviewModeState?.scope === scope ? reviewModeState.mode : "all";
  const reviewStats = runner
    ? summarizeReviews(runner.plan, runner.reviews)
    : null;
  const reviewItems = runner
    ? reviewCandidates(runner.plan, runner.reviews, reviewMode)
    : [];
  const [busyState, setBusyState] = useState<Busy | null>(null);
  const busy = busyState?.scope === scope ? busyState : null;
  const [noticeState, setNoticeState] = useState<Notice | null>(null);
  const notice = noticeState?.scope === scope ? noticeState : null;
  const [remoteSnapshot, setRemoteSnapshot] = useState<RemoteSnapshot | null>(
    null,
  );
  const remote = remoteSnapshot?.scope === scope ? remoteSnapshot : null;
  const [remoteBusyState, setRemoteBusyState] = useState<string | null>(null);
  const remoteBusy = remoteBusyState === scope;

  const {
    begin: beginContext,
    isCurrent: contextCurrent,
    finish: finishContext,
  } = useAsyncAuthorityFence("study-run-context:" + authScope);
  const {
    begin: beginLoad,
    isCurrent: loadCurrent,
    finish: finishLoad,
  } = useAsyncAuthorityFence("study-run-load:" + scope);
  const {
    begin: beginConfirm,
    isCurrent: confirmCurrent,
    finish: finishConfirm,
  } = useAsyncAuthorityFence(
    "study-run-confirm:" + scope + ":" + (activeKey ?? "none"),
  );
  const {
    begin: beginReview,
    isCurrent: reviewCurrent,
    finish: finishReview,
  } = useAsyncAuthorityFence("study-run-review:" + scope);
  const {
    begin: beginRemote,
    isCurrent: remoteCurrent,
    finish: finishRemote,
  } = useAsyncAuthorityFence("study-run-remote:" + scope);

  const loadContext = useCallback(async () => {
    if (status !== "authenticated") return;
    const ticket = beginContext();
    if (!contextCurrent(ticket)) return;
    setContextState({
      scope: authScope,
      loading: true,
      data: null,
      error: null,
    });
    try {
      const data = await searchApi.contextual(
        { subjectLimit: 8, resourcesPerSubject: 1 },
        ticket.signal,
      );
      if (contextCurrent(ticket)) {
        setContextState({
          scope: authScope,
          loading: false,
          data,
          error: null,
        });
      }
    } catch (error) {
      if (contextCurrent(ticket)) {
        setContextState({
          scope: authScope,
          loading: false,
          data: null,
          error: errorText(error),
        });
      }
    } finally {
      finishContext(ticket);
    }
  }, [status, authScope, beginContext, contextCurrent, finishContext]);

  const loadPlan = useCallback(
    async (source: StudySession, resetClocks = true) => {
      if (status !== "authenticated" || !subjectId) return;
      const ticket = beginLoad();
      if (!loadCurrent(ticket)) return;
      setBusyState({ scope, kind: "load" });
      setNoticeState(null);
      try {
        const plan = normalizeStudySession(source);
        if (plan.subjectId !== subjectId)
          throw new Error("STUDY_SESSION_SUBJECT_MISMATCH");
        if (!plan.tasks.length) throw new Error("STUDY_SESSION_EMPTY");
        // Portable IDs never grant access. Revalidate at most four activities
        // concurrently; a stale session or subject publishes no partial result.
        const labels = await verifyStudyTaskLabels(
          plan,
          (task) => verifiedTaskLabel(plan, task, ticket.signal),
          () => loadCurrent(ticket),
        );
        if (!labels || !loadCurrent(ticket)) return;
        const inaccessible = Object.values(labels).filter(
          (value) => value === null,
        ).length;
        setRunnerState((previous) => {
          const clocks: Record<string, TaskClock> = {};
          for (const item of plan.tasks) {
            const key = keyOf(item);
            const priorTask =
              previous?.scope === scope
                ? previous.plan.tasks.find(
                    (candidate) => keyOf(candidate) === key,
                  )
                : null;
            clocks[key] =
              !resetClocks && priorTask?.minutes === item.minutes
                ? pauseTaskClock(
                    previous!.clocks[key] ?? createTaskClock(item.minutes),
                    Date.now(),
                  )
                : createTaskClock(item.minutes);
          }
          const selected = plan.tasks.findIndex(
            (item) => !item.done && labels[keyOf(item)] !== null,
          );
          const reviews: ReviewMarks = {};
          if (!resetClocks && previous?.scope === scope) {
            for (const item of plan.tasks) {
              const key = keyOf(item);
              const rating = previous.reviews[key];
              if (rating && labels[key] !== null) reviews[key] = rating;
            }
          }
          return {
            scope,
            plan,
            labels,
            clocks,
            reviews,
            index: selected >= 0 ? selected : 0,
          };
        });
        setNow(Date.now());
        setNoticeState({
          scope,
          error: inaccessible > 0,
          text:
            inaccessible > 0
              ? "Hay " +
                inaccessible +
                " actividades sin acceso confirmado. No se pueden marcar hasta recuperar el permiso."
              : "Plan verificado. Podés empezar a estudiar.",
        });
      } catch (error) {
        if (loadCurrent(ticket)) {
          setNoticeState({ scope, error: true, text: errorText(error) });
        }
      } finally {
        if (loadCurrent(ticket)) setBusyState(null);
        finishLoad(ticket);
      }
    },
    [status, subjectId, scope, beginLoad, loadCurrent, finishLoad],
  );

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (!subjectId || status !== "authenticated") return;
    const draft = recallStudyDraft(scope, subjectId);
    if (draft) void loadPlan(draft);
  }, [subjectId, status, scope, loadPlan]);

  useEffect(() => {
    if (activeClockStartedAt === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeClockStartedAt, activeKey]);

  useEffect(() => {
    if (
      !activeKey ||
      !activeClock ||
      activeClock.startedAt === null ||
      remainingMs > 0
    )
      return;
    setRunnerState((previous) => {
      if (previous?.scope !== scope) return previous;
      const current = previous.plan.tasks[previous.index];
      if (!current || keyOf(current) !== activeKey) return previous;
      const clock = previous.clocks[activeKey];
      if (!clock || clock.startedAt === null) return previous;
      return {
        ...previous,
        clocks: {
          ...previous.clocks,
          [activeKey]: pauseTaskClock(clock, Date.now()),
        },
      };
    });
  }, [scope, activeKey, activeClock, remainingMs]);

  useEffect(() => {
    const onHidden = () => {
      if (!document.hidden) return;
      setRunnerState((previous) => {
        if (previous?.scope !== scope) return previous;
        const current = previous.plan.tasks[previous.index];
        if (!current) return previous;
        const key = keyOf(current);
        const clock = previous.clocks[key];
        if (!clock || clock.startedAt === null) return previous;
        return {
          ...previous,
          clocks: {
            ...previous.clocks,
            [key]: pauseTaskClock(clock, Date.now()),
          },
        };
      });
      setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [scope]);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !subjectId || busy || remoteBusy) return;
    if (file.size > 64000) {
      setNoticeState({
        scope,
        error: true,
        text: "El archivo supera los 64 KB permitidos.",
      });
      return;
    }
    if (
      runner &&
      !window.confirm(
        "¿Reemplazar la ejecución actual por este archivo? El tiempo transcurrido no se exporta.",
      )
    )
      return;
    try {
      const text = await file.text();
      const imported = readStudySession(text);
      if (imported.subjectId !== subjectId)
        throw new Error("STUDY_SESSION_SUBJECT_MISMATCH");
      await loadPlan(imported);
    } catch (error) {
      setNoticeState({ scope, error: true, text: errorText(error) });
    }
  };

  const move = (index: number) => {
    if (
      !runner ||
      busy ||
      remoteBusy ||
      index < 0 ||
      index >= runner.plan.tasks.length
    )
      return;
    setRunnerState((old) => {
      if (old?.scope !== scope) return old;
      const active = old.plan.tasks[old.index];
      const key = active && keyOf(active);
      return {
        ...old,
        index,
        clocks: key
          ? {
              ...old.clocks,
              [key]: pauseTaskClock(old.clocks[key], Date.now()),
            }
          : old.clocks,
      };
    });
    setNow(Date.now());
  };

  const changeClock = (operation: "toggle" | "reset") => {
    if (
      !runner ||
      !activeKey ||
      !task ||
      !label ||
      busy ||
      remoteBusy ||
      task.done ||
      document.hidden
    )
      return;
    const instant = Date.now();
    setRunnerState((old) => {
      if (old?.scope !== scope) return old;
      const current = old.plan.tasks[old.index];
      if (!current || keyOf(current) !== activeKey) return old;
      const oldClock = old.clocks[activeKey];
      if (!oldClock) return old;
      const next =
        operation === "reset"
          ? createTaskClock(task.minutes)
          : oldClock.startedAt === null
            ? startTaskClock(oldClock, instant)
            : pauseTaskClock(oldClock, instant);
      return { ...old, clocks: { ...old.clocks, [activeKey]: next } };
    });
    setNow(instant);
  };

  const confirmDone = async () => {
    if (
      !runner ||
      !task ||
      !activeKey ||
      !label ||
      !subjectId ||
      busy ||
      remoteBusy
    )
      return;
    const ticket = beginConfirm();
    if (!confirmCurrent(ticket)) return;
    setBusyState({ scope, kind: "confirm", key: activeKey });
    setNoticeState(null);
    try {
      const fresh = await verifiedTaskLabel(runner.plan, task, ticket.signal);
      if (!confirmCurrent(ticket)) return;
      if (!fresh) {
        setRunnerState((old) =>
          old?.scope === scope
            ? { ...old, labels: { ...old.labels, [activeKey]: null } }
            : old,
        );
        setNoticeState({
          scope,
          error: true,
          text: "El acceso a esta actividad cambió. No se modificó su estado.",
        });
        return;
      }
      setRunnerState((old) => {
        if (
          old?.scope !== scope ||
          keyOf(old.plan.tasks[old.index]) !== activeKey
        )
          return old;
        const next = updateRunTask(old.plan, task.kind, task.id, !task.done);
        return {
          ...old,
          plan: next,
          labels: { ...old.labels, [activeKey]: fresh },
          clocks: {
            ...old.clocks,
            [activeKey]: pauseTaskClock(old.clocks[activeKey], Date.now()),
          },
        };
      });
      setNow(Date.now());
      setNoticeState({
        scope,
        error: false,
        text: task.done
          ? "Actividad reabierta."
          : "Actividad marcada como realizada por vos.",
      });
    } catch (error) {
      if (confirmCurrent(ticket)) {
        setNoticeState({ scope, error: true, text: errorText(error) });
      }
    } finally {
      if (confirmCurrent(ticket)) setBusyState(null);
      finishConfirm(ticket);
    }
  };

  const rateCurrent = (rating: ReviewMark | null) => {
    if (!runner || !task || !activeKey || !label || busy || remoteBusy) return;
    setRunnerState((previous) => {
      if (previous?.scope !== scope) return previous;
      const current = previous.plan.tasks[previous.index];
      if (
        !current ||
        keyOf(current) !== activeKey ||
        !previous.labels[activeKey]
      ) {
        return previous;
      }
      return {
        ...previous,
        reviews: updateReviewMarks(
          previous.plan,
          previous.reviews,
          current.kind,
          current.id,
          rating,
        ),
      };
    });
    setNoticeState(null);
  };

  const createNextReview = async (destination: "download" | "planner") => {
    if (
      !runner ||
      !subjectId ||
      status !== "authenticated" ||
      busy ||
      remoteBusy ||
      !reviewItems.length
    ) {
      return;
    }
    const ticket = beginReview();
    if (!reviewCurrent(ticket)) return;
    setBusyState({ scope, kind: "review" });
    setNoticeState(null);
    try {
      const freshLabels: Record<string, string | null> = {};
      let cursor = 0;
      // Fixed maximum concurrency: at most four live requests even for a
      // 24-activity review. No request broadening and no silent error skips.
      const workers = Array.from(
        { length: Math.min(4, reviewItems.length) },
        async () => {
          while (cursor < reviewItems.length) {
            if (!reviewCurrent(ticket)) return;
            const candidate = reviewItems[cursor++];
            if (!candidate) return;
            const value = await verifiedTaskLabel(
              runner.plan,
              candidate,
              ticket.signal,
            );
            if (!reviewCurrent(ticket)) return;
            freshLabels[keyOf(candidate)] = value;
          }
        },
      );
      await Promise.all(workers);
      if (!reviewCurrent(ticket)) return;
      const permitted = reviewItems
        .filter((candidate) => freshLabels[keyOf(candidate)] !== null)
        .map(keyOf);
      setRunnerState((previous) =>
        previous?.scope === scope
          ? { ...previous, labels: { ...previous.labels, ...freshLabels } }
          : previous,
      );

      const omitted = reviewItems.length - permitted.length;
      if (!permitted.length) {
        setNoticeState({
          scope,
          error: true,
          text: "Ninguna actividad seleccionada conserva acceso confirmado. Revisá tu plan.",
        });
        return;
      }
      if (
        omitted > 0 &&
        !window.confirm(
          "Hay " +
            omitted +
            " actividades sin acceso vigente. ¿Crear el nuevo repaso sólo con las " +
            permitted.length +
            " verificadas?",
        )
      ) {
        setNoticeState({
          scope,
          error: true,
          text: "No se generó el repaso: había referencias sin acceso confirmado.",
        });
        return;
      }
      if (!reviewCurrent(ticket)) return;
      const next = buildReviewSession(
        runner.plan,
        runner.reviews,
        reviewMode,
        permitted,
      );
      if (!next) throw new Error("STUDY_REVIEW_EMPTY");
      if (destination === "download") {
        downloadPlan(next, "los-apuntes-proximo-repaso.json");
        setNoticeState({
          scope,
          error: false,
          text:
            "Se exportó el repaso con " +
            next.tasks.length +
            " actividades verificadas" +
            (omitted ? " (se omitieron " + omitted + ")." : "."),
        });
      } else {
        // The Planner accepts a nonce, not a plan in the URL. It verifies every
        // reference once more before offering append/replace.
        const handoff = createStudyHandoff(next, scope);
        if (!reviewCurrent(ticket)) return;
        navigate("/study/session?subjectId=" + encodeURIComponent(subjectId), {
          state: handoff,
        });
      }
    } catch (error) {
      if (reviewCurrent(ticket)) {
        setNoticeState({ scope, error: true, text: errorText(error) });
      }
    } finally {
      if (reviewCurrent(ticket)) setBusyState(null);
      finishReview(ticket);
    }
  };

  const inspectRemote = async () => {
    if (
      !STUDY_PROGRESS_VISIBLE ||
      !subjectId ||
      status !== "authenticated" ||
      busy ||
      remoteBusy
    )
      return;
    const ticket = beginRemote();
    if (!remoteCurrent(ticket)) return;
    setRemoteBusyState(scope);
    setNoticeState(null);
    try {
      const found = await studyProgressApi.get(subjectId, ticket.signal);
      if (!remoteCurrent(ticket)) return;
      setRemoteSnapshot({
        scope,
        revision: found.revision,
        plan: found.plan,
        updatedAt: found.updatedAt,
      });
      setNoticeState({
        scope,
        error: false,
        text: "Encontramos un plan privado guardado. Podés recuperarlo o actualizarlo con tu trabajo actual.",
      });
    } catch (error) {
      if (!remoteCurrent(ticket)) return;
      if (isStudyProgressApiError(error) && error.status === 404) {
        setRemoteSnapshot({ scope, revision: 0, plan: null, updatedAt: null });
        setNoticeState({
          scope,
          error: false,
          text: "Todavía no guardaste una sesión de esta materia en tu cuenta.",
        });
      } else {
        setRemoteSnapshot(null);
        setNoticeState({ scope, error: true, text: errorText(error) });
      }
    } finally {
      if (remoteCurrent(ticket)) setRemoteBusyState(null);
      finishRemote(ticket);
    }
  };

  const saveRemote = async () => {
    if (
      !STUDY_PROGRESS_VISIBLE ||
      !subjectId ||
      !runner ||
      !remote ||
      status !== "authenticated" ||
      busy ||
      remoteBusy
    )
      return;
    if (
      remote.revision > 0 &&
      !window.confirm(
        "¿Actualizar el guardado de tu cuenta con este plan? " +
          "Si el otro dispositivo lo modificó, el servidor rechazará esta versión.",
      )
    )
      return;
    const ticket = beginRemote();
    if (!remoteCurrent(ticket)) return;
    setRemoteBusyState(scope);
    setNoticeState(null);
    try {
      const saved = await studyProgressApi.save(
        subjectId,
        runner.plan,
        remote.revision,
        ticket.signal,
      );
      if (!remoteCurrent(ticket)) return;
      setRemoteSnapshot({
        scope,
        plan: saved.plan,
        revision: saved.revision,
        updatedAt: saved.updatedAt,
      });
      setNoticeState({
        scope,
        error: false,
        text: "Progreso guardado en tu cuenta. Podés recuperarlo desde otro dispositivo.",
      });
    } catch (error) {
      if (!remoteCurrent(ticket)) return;
      if (isStudyProgressApiError(error) && error.status === 409) {
        setRemoteSnapshot(null);
      }
      setNoticeState({ scope, error: true, text: errorText(error) });
    } finally {
      if (remoteCurrent(ticket)) setRemoteBusyState(null);
      finishRemote(ticket);
    }
  };

  const restoreRemote = async () => {
    if (
      !STUDY_PROGRESS_VISIBLE ||
      !subjectId ||
      !remote?.plan ||
      status !== "authenticated" ||
      busy ||
      remoteBusy
    )
      return;
    if (
      runner &&
      !window.confirm(
        "¿Reemplazar la sesión local por el guardado de tu cuenta? " +
          "El tiempo y las valoraciones de esta pestaña se perderán. " +
          "Podés exportar primero tu JSON.",
      )
    )
      return;
    const ticket = beginRemote();
    if (!remoteCurrent(ticket)) return;
    setRemoteBusyState(scope);
    setNoticeState(null);
    try {
      // A device may have saved again since the first consultation.
      // Recheck the exact remote revision before discarding local work.
      const latest = await studyProgressApi.get(subjectId, ticket.signal);
      if (!remoteCurrent(ticket)) return;
      if (latest.revision !== remote.revision) {
        setRemoteSnapshot({
          scope,
          plan: latest.plan,
          revision: latest.revision,
          updatedAt: latest.updatedAt,
        });
        setNoticeState({
          scope,
          error: true,
          text: "El guardado cambió en otro dispositivo. Revisá su nueva fecha y volvé a confirmar la recuperación.",
        });
        return;
      }
      await loadPlan(latest.plan);
    } catch (error) {
      if (remoteCurrent(ticket)) {
        if (isStudyProgressApiError(error) && error.status === 404) {
          setRemoteSnapshot({
            scope,
            revision: 0,
            plan: null,
            updatedAt: null,
          });
        }
        setNoticeState({ scope, error: true, text: errorText(error) });
      }
    } finally {
      if (remoteCurrent(ticket)) setRemoteBusyState(null);
      finishRemote(ticket);
    }
  };

  const deleteRemote = async () => {
    if (
      !STUDY_PROGRESS_VISIBLE ||
      !subjectId ||
      !remote ||
      remote.revision === 0 ||
      status !== "authenticated" ||
      busy ||
      remoteBusy
    )
      return;
    if (
      !window.confirm(
        "¿Eliminar el plan guardado en tu cuenta para esta materia? " +
          "Tu sesión local y tus archivos JSON no se borrarán.",
      )
    )
      return;
    const ticket = beginRemote();
    if (!remoteCurrent(ticket)) return;
    setRemoteBusyState(scope);
    setNoticeState(null);
    try {
      await studyProgressApi.remove(subjectId, remote.revision, ticket.signal);
      if (!remoteCurrent(ticket)) return;
      setRemoteSnapshot({ scope, revision: 0, plan: null, updatedAt: null });
      setNoticeState({
        scope,
        error: false,
        text: "Se eliminó el guardado de tu cuenta.",
      });
    } catch (error) {
      if (!remoteCurrent(ticket)) return;
      if (
        isStudyProgressApiError(error) &&
        (error.status === 409 || error.status === 404)
      ) {
        setRemoteSnapshot(null);
      }
      setNoticeState({ scope, error: true, text: errorText(error) });
    } finally {
      if (remoteCurrent(ticket)) setRemoteBusyState(null);
      finishRemote(ticket);
    }
  };

  const exportUpdated = () => {
    if (!runner || busy) return;
    downloadPlan(runner.plan);
    setNoticeState({
      scope,
      error: false,
      text: "Plan actualizado exportado. Conservá el JSON para continuar en otro dispositivo.",
    });
  };

  const back = subjectId
    ? "/study/session?subjectId=" + encodeURIComponent(subjectId)
    : "/study";

  return (
    <section className="study-runner" aria-labelledby="study-runner-title">
      <header className="study-runner-header">
        <div>
          <p className="study-runner-kicker">
            Mesa de estudio · Modo concentración
          </p>
          <h1 id="study-runner-title">Realizar mi sesión</h1>
          <p>
            Seguí tu plan a tu ritmo. El temporizador es opcional y no marca
            tareas automáticamente.
          </p>
        </div>
        <Link to={back}>Volver al Planificador</Link>
      </header>
      {status !== "authenticated" || !context || context.loading ? (
        <p role="status">Comprobando tu sesión y contexto académico…</p>
      ) : context.error ? (
        <div role="alert" className="study-runner-notice">
          <p>{context.error}</p>
          <button type="button" onClick={() => void loadContext()}>
            Reintentar
          </button>
        </div>
      ) : !subjectId ? (
        <div className="study-runner-panel">
          <h2>Seleccioná una materia actual</h2>
          <p>
            Este enlace no incluye una materia válida dentro de tu contexto
            académico.
          </p>
          <Link to="/study">Ir a la Mesa de estudio</Link>
        </div>
      ) : (
        <>
          <div className="study-runner-subject">
            <strong>{subject?.name}</strong>
            <Link to={studySubjectHref(subjectId) ?? "/study"}>
              Ver mi Mesa
            </Link>
          </div>
          <section
            className="study-runner-panel"
            aria-labelledby="study-run-load"
          >
            <h2 id="study-run-load">Mi plan</h2>
            <p>
              Al entrar desde el Planificador se recupera el borrador de esta
              pestaña. También podés importar su JSON. Los permisos se vuelven a
              comprobar; no se guardan títulos ni respuestas en el navegador.
            </p>
            <div className="study-runner-actions">
              <label>
                Importar una sesión JSON
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => void onFile(event)}
                  disabled={Boolean(busy) || remoteBusy}
                />
              </label>
              {runner && (
                <>
                  <button
                    type="button"
                    disabled={Boolean(busy) || remoteBusy}
                    onClick={() => void loadPlan(runner.plan, false)}
                  >
                    Verificar accesos otra vez
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy) || remoteBusy}
                    onClick={exportUpdated}
                  >
                    Exportar progreso JSON
                  </button>
                </>
              )}
            </div>
            {busy?.kind === "load" && (
              <p role="status">Verificando actividades…</p>
            )}
            {notice && (
              <p
                className={
                  notice.error ? "study-runner-notice" : "study-runner-success"
                }
                role={notice.error ? "alert" : "status"}
              >
                {notice.text}
              </p>
            )}
          </section>
          {STUDY_PROGRESS_VISIBLE && (
            <section
              className="study-runner-panel study-runner-cloud"
              aria-labelledby="study-runner-cloud-title"
            >
              <h2 id="study-runner-cloud-title">
                Continuar entre dispositivos
              </h2>
              <p>
                Guardá una copia privada de tu sesión en tu cuenta o recuperá la
                última que hayas guardado desde otro dispositivo. Nunca
                sobrescribimos versiones más nuevas: primero consultá el estado
                del servidor.
              </p>
              <div className="study-runner-actions">
                <button
                  type="button"
                  disabled={Boolean(busy) || remoteBusy}
                  onClick={() => void inspectRemote()}
                >
                  Consultar mi guardado
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || remoteBusy || !runner || !remote}
                  onClick={() => void saveRemote()}
                >
                  Guardar sesión en mi cuenta
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || remoteBusy || !remote?.plan}
                  onClick={() => void restoreRemote()}
                >
                  Recuperar sesión guardada
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || remoteBusy || !remote?.plan}
                  onClick={() => void deleteRemote()}
                >
                  Eliminar guardado de mi cuenta
                </button>
              </div>
              {remoteBusy && (
                <p role="status">Consultando tu progreso privado…</p>
              )}
              {remote && (
                <p className="study-runner-help" role="status">
                  {remote.plan
                    ? "Guardado: " +
                      remote.plan.title +
                      " · " +
                      remote.plan.tasks.length +
                      " actividades · revisión " +
                      remote.revision +
                      " · actualizado " +
                      new Date(remote.updatedAt!).toLocaleString("es-AR")
                    : "Todavía no hay una sesión guardada en esta materia."}
                </p>
              )}
              <p className="study-runner-help">
                Las valoraciones personales y los cronómetros no se sincronizan.
                Solo se guarda el plan v1 y las actividades realizadas. Para
                recuperar un guardado, sus recursos se verifican nuevamente. El
                archivo JSON sigue disponible como copia independiente.
              </p>
            </section>
          )}
          {!runner ? (
            <div className="study-runner-panel">
              <h2>No hay una sesión activa</h2>
              <p>
                Prepará un plan con actividades y elegí «Realizar esta sesión»,
                o importá uno compatible.
              </p>
              <Link to={back}>Preparar mi sesión</Link>
            </div>
          ) : (
            <div className="study-runner-grid">
              <section
                className="study-runner-panel"
                aria-labelledby="study-run-current"
              >
                <h2 id="study-run-current">{runner.plan.title}</h2>
                <p className="study-runner-progress" aria-live="polite">
                  {stats?.done} de {stats?.total} actividades realizadas ·{" "}
                  {stats?.doneMinutes} de {stats?.totalMinutes} minutos
                  planificados
                </p>
                {runner.plan.notes && (
                  <p className="study-runner-notes">
                    <strong>Objetivo:</strong> {runner.plan.notes}
                  </p>
                )}
                {task && (
                  <div className="study-runner-current">
                    <p>
                      Actividad {runner.index + 1} de {runner.plan.tasks.length}{" "}
                      · {task.kind === "question" ? "Pregunta" : "Apunte"}
                    </p>
                    <h3>{label ?? "Contenido sin acceso confirmado"}</h3>
                    <p>
                      {task.minutes} minutos previstos ·{" "}
                      {task.done ? "Realizada" : "Pendiente"}
                    </p>
                    {label ? (
                      <Link
                        to={
                          task.kind === "resource"
                            ? "/resources/" + encodeURIComponent(task.id)
                            : "/questions?id=" + encodeURIComponent(task.id)
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir contenido en otra pestaña
                      </Link>
                    ) : (
                      <p role="alert">
                        No marques esta actividad sin recuperar su acceso
                        vigente.
                      </p>
                    )}
                    <div
                      className="study-runner-clock"
                      role="timer"
                      aria-label="Tiempo disponible en la actividad"
                    >
                      {clockText(remainingMs)}
                    </div>
                    <p className="study-runner-help">
                      {remainingMs === 0
                        ? "Tiempo previsto finalizado. Decidís si la tarea está realizada."
                        : activeClock?.startedAt === null
                          ? "Temporizador pausado."
                          : "Temporizador en marcha. Se pausa al ocultar la pestaña."}
                    </p>
                    <div className="study-runner-actions">
                      <button
                        type="button"
                        disabled={
                          Boolean(busy) ||
                          remoteBusy ||
                          !label ||
                          task.done ||
                          remainingMs === 0
                        }
                        onClick={() => changeClock("toggle")}
                      >
                        {activeClock?.startedAt === null
                          ? "Iniciar o reanudar"
                          : "Pausar"}
                      </button>
                      <button
                        type="button"
                        disabled={
                          Boolean(busy) || remoteBusy || !label || task.done
                        }
                        onClick={() => changeClock("reset")}
                      >
                        Reiniciar tiempo
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy) || remoteBusy || !label}
                        onClick={() => void confirmDone()}
                      >
                        {task.done
                          ? "Marcar pendiente"
                          : "Marcar como realizada"}
                      </button>
                    </div>
                    <StudyRunnerShortcuts
                      key={`${scope}:${runner.plan.title}:${runner.plan.tasks.map(keyOf).join("|")}`}
                      allowed={{
                        previous: !busy && !remoteBusy && runner.index > 0,
                        next:
                          !busy &&
                          !remoteBusy &&
                          runner.index < runner.plan.tasks.length - 1,
                        clock:
                          !busy &&
                          !remoteBusy &&
                          Boolean(label) &&
                          !task.done &&
                          Boolean(activeClock) &&
                          remainingMs > 0 &&
                          !document.hidden,
                      }}
                      onPrevious={() => move(runner.index - 1)}
                      onNext={() => move(runner.index + 1)}
                      onClock={() => changeClock("toggle")}
                    />
                    <fieldset
                      className="study-runner-ratings"
                      disabled={Boolean(busy) || remoteBusy || !label}
                    >
                      <legend>¿Cómo te resultó esta actividad?</legend>
                      <p className="study-runner-help">
                        Es una valoración personal: no cambia «realizada» ni
                        implica una calificación.
                      </p>
                      <div className="study-runner-actions">
                        <button
                          type="button"
                          aria-pressed={
                            runner.reviews[activeKey ?? ""] === "repeat"
                          }
                          onClick={() => rateCurrent("repeat")}
                        >
                          Necesito repasar
                        </button>
                        <button
                          type="button"
                          aria-pressed={
                            runner.reviews[activeKey ?? ""] === "reinforce"
                          }
                          onClick={() => rateCurrent("reinforce")}
                        >
                          Quiero reforzar
                        </button>
                        <button
                          type="button"
                          aria-pressed={
                            runner.reviews[activeKey ?? ""] === "confident"
                          }
                          onClick={() => rateCurrent("confident")}
                        >
                          Lo tengo claro
                        </button>
                        <button
                          type="button"
                          disabled={
                            Boolean(busy) ||
                            remoteBusy ||
                            !label ||
                            !runner.reviews[activeKey ?? ""]
                          }
                          onClick={() => rateCurrent(null)}
                        >
                          Quitar valoración
                        </button>
                      </div>
                    </fieldset>
                    {busy?.kind === "confirm" && (
                      <p role="status">
                        Comprobando acceso antes de guardar la marca…
                      </p>
                    )}
                    <div className="study-runner-navigation">
                      <button
                        type="button"
                        disabled={
                          Boolean(busy) || remoteBusy || runner.index === 0
                        }
                        onClick={() => move(runner.index - 1)}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        disabled={
                          Boolean(busy) ||
                          remoteBusy ||
                          runner.index === runner.plan.tasks.length - 1
                        }
                        onClick={() => move(runner.index + 1)}
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </section>
              <section
                className="study-runner-panel"
                aria-labelledby="study-run-list"
              >
                <h2 id="study-run-list">Actividades del plan</h2>
                <ol className="study-runner-list">
                  {runner.plan.tasks.map((item, index) => {
                    const key = keyOf(item);
                    const itemLabel = runner.labels[key];
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          disabled={Boolean(busy) || remoteBusy}
                          aria-current={
                            index === runner.index ? "step" : undefined
                          }
                          onClick={() => move(index)}
                        >
                          <span>
                            {index + 1}. {itemLabel ?? "Sin acceso"}
                          </span>
                          <small>
                            {item.done
                              ? "Realizada"
                              : itemLabel
                                ? "Pendiente"
                                : "Requiere acceso"}
                            {" · "}
                            {item.minutes} min
                            {runner.reviews[key] === "repeat"
                              ? " · Necesito repasar"
                              : runner.reviews[key] === "reinforce"
                                ? " · Quiero reforzar"
                                : runner.reviews[key] === "confident"
                                  ? " · Lo tengo claro"
                                  : ""}
                          </small>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <p className="study-runner-help">
                  Las marcas son autodeclaradas. Los tiempos no se guardan en el
                  JSON; al cambiar de actividad se pausa su temporizador. El
                  progreso se conserva únicamente en esta pestaña hasta que
                  exportes el archivo.
                </p>
              </section>
              <section
                className="study-runner-panel study-runner-review"
                aria-labelledby="study-run-review"
              >
                <h2 id="study-run-review">Preparar mi próximo repaso</h2>
                <p>
                  Elegí qué volver a estudiar a partir de tus valoraciones. Las
                  actividades pendientes sin valorar se incluyen como prioridad;
                  las que marcaste «Lo tengo claro» quedan afuera. No se
                  calculan notas ni resultados de examen.
                </p>
                <div className="study-runner-review-summary" aria-live="polite">
                  <span>{reviewStats?.repeat} para repasar</span>
                  <span>
                    {reviewStats?.pendingUnrated} pendientes sin valorar
                  </span>
                  <span>{reviewStats?.reinforce} para reforzar</span>
                  <span>{reviewStats?.confident} claras</span>
                </div>
                <label className="study-runner-review-filter">
                  Qué incluir en el próximo plan
                  <select
                    value={reviewMode}
                    disabled={Boolean(busy) || remoteBusy}
                    onChange={(event) =>
                      setReviewModeState({
                        scope,
                        mode: event.target.value as ReviewMode,
                      })
                    }
                  >
                    <option value="all">Todo lo que necesita repaso</option>
                    <option value="priority">
                      Prioridad: repasar y pendiente
                    </option>
                    <option value="reinforce">
                      Sólo actividades para reforzar
                    </option>
                  </select>
                </label>
                {reviewItems.length === 0 ? (
                  <p className="study-runner-help">
                    No hay actividades para este filtro. Podés valorar las
                    actividades o elegir otra opción.
                  </p>
                ) : (
                  <ol className="study-runner-review-preview">
                    {reviewItems.map((item) => (
                      <li key={keyOf(item)}>
                        <strong>
                          {runner.labels[keyOf(item)] ??
                            "Sin acceso confirmado"}
                        </strong>
                        <small>
                          {item.category === "repeat"
                            ? "Necesito repasar"
                            : item.category === "pending"
                              ? "Pendiente"
                              : "Quiero reforzar"}
                          {" · "}
                          {item.minutes} min
                        </small>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="study-runner-help">
                  El nuevo plan reinicia las casillas de progreso, conserva las
                  duraciones y no incluye títulos, valoraciones ni notas
                  privadas. Antes de generarlo se comprueba de nuevo el acceso a
                  cada actividad.
                </p>
                <div className="study-runner-actions">
                  <button
                    type="button"
                    disabled={
                      Boolean(busy) || remoteBusy || reviewItems.length === 0
                    }
                    onClick={() => void createNextReview("planner")}
                  >
                    Pasar al Planificador
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(busy) || remoteBusy || reviewItems.length === 0
                    }
                    onClick={() => void createNextReview("download")}
                  >
                    Exportar próximo repaso JSON
                  </button>
                </div>
                {busy?.kind === "review" && (
                  <p role="status">Comprobando accesos del próximo repaso…</p>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
