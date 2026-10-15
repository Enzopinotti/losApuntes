import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type { ContextualDiscoveryResponse } from "../features/search/interfaces";
import { isSearchApiError, searchApi } from "../features/search/services/searchService";
import { isResourcesApiError, resourcesApi } from "../features/resources/services/resourcesService";
import { communityApi, isCommunityApiError } from "../features/community/services/communityService";
import {
  readStudySession,
  normalizeStudySession,
  serializeStudySession,
  type StudySession,
  type StudySessionTask,
} from "../features/study/study-session-plan.mjs";
import { recallStudyDraft } from "../features/study/study-session-draft.mjs";
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
  index: number;
};
type Notice = { scope: string; text: string; error: boolean };
type Busy = { scope: string; kind: "load" | "confirm"; key?: string };

function keyOf(task: Pick<StudySessionTask, "kind" | "id">): string {
  return task.kind + ":" + task.id;
}

function errorText(error: unknown): string {
  if (isResourcesApiError(error) || isCommunityApiError(error) || isSearchApiError(error)) {
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
        ? response.resource.title : null;
    }
    const response = await communityApi.question(task.id, signal);
    return response.question.academic.subject.id === plan.subjectId
      ? response.question.title : null;
  } catch (error) {
    if (
      (isResourcesApiError(error) || isCommunityApiError(error)) &&
      (error.status === 403 || error.status === 404)
    ) return null;
    throw error;
  }
}

function downloadPlan(plan: StudySession) {
  const content = serializeStudySession(plan);
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "los-apuntes-sesion-actualizada.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clockText(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
    String(seconds % 60).padStart(2, "0");
}

export default function StudyRunner() {
  const { status, user, session } = useAuth();
  const [params] = useSearchParams();
  const selection = studySubjectSelectionFromParams(params);
  const authScope = [status, user?.id ?? "anonymous", session?.id ?? "none"].join(":");
  const [contextState, setContextState] = useState<Context | null>(null);
  const context = contextState?.scope === authScope ? contextState : null;
  const resolution = context?.data
    ? resolveStudySubject(selection, context.data.subjects) : null;
  const subject = selection.kind === "selected" && resolution?.kind === "ready"
    ? resolution.subject : null;
  const subjectId = subject?.id ?? null;
  const scope = authScope + ":" + (subjectId ?? "none");

  const [runnerState, setRunnerState] = useState<Runner | null>(null);
  const runner = runnerState?.scope === scope ? runnerState : null;
  const task = runner?.plan.tasks[runner.index] ?? null;
  const activeKey = task ? keyOf(task) : null;
  const label = activeKey ? runner?.labels[activeKey] ?? null : null;
  const activeClock = activeKey ? runner?.clocks[activeKey] ?? null : null;
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = activeClock ? remainingTaskClock(activeClock, now) : 0;
  const stats = runner ? runSummary(runner.plan) : null;
  const [busyState, setBusyState] = useState<Busy | null>(null);
  const busy = busyState?.scope === scope ? busyState : null;
  const [noticeState, setNoticeState] = useState<Notice | null>(null);
  const notice = noticeState?.scope === scope ? noticeState : null;

  const { begin: beginContext, isCurrent: contextCurrent, finish: finishContext } =
    useAsyncAuthorityFence("study-run-context:" + authScope);
  const { begin: beginLoad, isCurrent: loadCurrent, finish: finishLoad } =
    useAsyncAuthorityFence("study-run-load:" + scope);
  const { begin: beginConfirm, isCurrent: confirmCurrent, finish: finishConfirm } =
    useAsyncAuthorityFence("study-run-confirm:" + scope + ":" + (activeKey ?? "none"));

  const loadContext = useCallback(async () => {
    if (status !== "authenticated") return;
    const ticket = beginContext();
    if (!contextCurrent(ticket)) return;
    setContextState({ scope: authScope, loading: true, data: null, error: null });
    try {
      const data = await searchApi.contextual(
        { subjectLimit: 8, resourcesPerSubject: 1 }, ticket.signal,
      );
      if (contextCurrent(ticket)) {
        setContextState({ scope: authScope, loading: false, data, error: null });
      }
    } catch (error) {
      if (contextCurrent(ticket)) {
        setContextState({
          scope: authScope, loading: false, data: null, error: errorText(error),
        });
      }
    } finally {
      finishContext(ticket);
    }
  }, [status, authScope, beginContext, contextCurrent, finishContext]);

  const loadPlan = useCallback(async (source: StudySession, resetClocks = true) => {
    if (status !== "authenticated" || !subjectId) return;
    const ticket = beginLoad();
    if (!loadCurrent(ticket)) return;
    setBusyState({ scope, kind: "load" });
    setNoticeState(null);
    try {
      const plan = normalizeStudySession(source);
      if (plan.subjectId !== subjectId) throw new Error("STUDY_SESSION_SUBJECT_MISMATCH");
      if (!plan.tasks.length) throw new Error("STUDY_SESSION_EMPTY");
      const labels: Record<string, string | null> = {};
      // Bounded by the existing 24-task contract. Recheck each item against
      // the server; an opaque UUID from a portable plan never grants access.
      for (const task of plan.tasks) {
        if (!loadCurrent(ticket)) return;
        labels[keyOf(task)] = await verifiedTaskLabel(plan, task, ticket.signal);
      }
      if (!loadCurrent(ticket)) return;
      const inaccessible = Object.values(labels).filter((value) => value === null).length;
      setRunnerState((previous) => {
        const clocks: Record<string, TaskClock> = {};
        for (const item of plan.tasks) {
          const key = keyOf(item);
          const priorTask = previous?.scope === scope
            ? previous.plan.tasks.find((candidate) => keyOf(candidate) === key)
            : null;
          clocks[key] = !resetClocks && priorTask?.minutes === item.minutes
            ? pauseTaskClock(previous!.clocks[key] ?? createTaskClock(item.minutes), Date.now())
            : createTaskClock(item.minutes);
        }
        const selected = plan.tasks.findIndex(
          (item) => !item.done && labels[keyOf(item)] !== null,
        );
        return { scope, plan, labels, clocks, index: selected >= 0 ? selected : 0 };
      });
      setNow(Date.now());
      setNoticeState({
        scope, error: inaccessible > 0,
        text: inaccessible > 0
          ? "Hay " + inaccessible + " actividades sin acceso confirmado. No se pueden marcar hasta recuperar el permiso."
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
  }, [status, subjectId, scope, beginLoad, loadCurrent, finishLoad]);

  useEffect(() => { void loadContext(); }, [loadContext]);

  useEffect(() => {
    if (!subjectId || status !== "authenticated") return;
    const draft = recallStudyDraft(scope, subjectId);
    if (draft) void loadPlan(draft);
  }, [subjectId, status, scope, loadPlan]);

  useEffect(() => {
    if (!activeClock || activeClock.startedAt === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeClock?.startedAt, activeKey]);

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
          clocks: { ...previous.clocks, [key]: pauseTaskClock(clock, Date.now()) },
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
    if (!file || !subjectId || busy) return;
    if (file.size > 64000) {
      setNoticeState({ scope, error: true, text: "El archivo supera los 64 KB permitidos." });
      return;
    }
    if (runner && !window.confirm("¿Reemplazar la ejecución actual por este archivo? El tiempo transcurrido no se exporta.")) return;
    try {
      const text = await file.text();
      const imported = readStudySession(text);
      if (imported.subjectId !== subjectId) throw new Error("STUDY_SESSION_SUBJECT_MISMATCH");
      await loadPlan(imported);
    } catch (error) {
      setNoticeState({ scope, error: true, text: errorText(error) });
    }
  };

  const move = (index: number) => {
    if (!runner || busy || index < 0 || index >= runner.plan.tasks.length) return;
    setRunnerState((old) => {
      if (old?.scope !== scope) return old;
      const active = old.plan.tasks[old.index];
      const key = active && keyOf(active);
      return {
        ...old, index,
        clocks: key
          ? { ...old.clocks, [key]: pauseTaskClock(old.clocks[key], Date.now()) }
          : old.clocks,
      };
    });
    setNow(Date.now());
  };

  const changeClock = (operation: "toggle" | "reset") => {
    if (!runner || !activeKey || !task || !label || busy || task.done || document.hidden) return;
    const instant = Date.now();
    setRunnerState((old) => {
      if (old?.scope !== scope || keyOf(old.plan.tasks[old.index]) !== activeKey) return old;
      const oldClock = old.clocks[activeKey];
      const next = operation === "reset"
        ? createTaskClock(task.minutes)
        : oldClock.startedAt === null
          ? startTaskClock(oldClock, instant)
          : pauseTaskClock(oldClock, instant);
      return { ...old, clocks: { ...old.clocks, [activeKey]: next } };
    });
    setNow(instant);
  };

  const confirmDone = async () => {
    if (!runner || !task || !activeKey || !label || !subjectId || busy) return;
    const ticket = beginConfirm();
    if (!confirmCurrent(ticket)) return;
    setBusyState({ scope, kind: "confirm", key: activeKey });
    setNoticeState(null);
    try {
      const fresh = await verifiedTaskLabel(runner.plan, task, ticket.signal);
      if (!confirmCurrent(ticket)) return;
      if (!fresh) {
        setRunnerState((old) => old?.scope === scope
          ? { ...old, labels: { ...old.labels, [activeKey]: null } }
          : old);
        setNoticeState({
          scope, error: true,
          text: "El acceso a esta actividad cambió. No se modificó su estado.",
        });
        return;
      }
      setRunnerState((old) => {
        if (old?.scope !== scope || keyOf(old.plan.tasks[old.index]) !== activeKey) return old;
        const next = updateRunTask(old.plan, task.kind, task.id, !task.done);
        return {
          ...old, plan: next, labels: { ...old.labels, [activeKey]: fresh },
          clocks: {
            ...old.clocks,
            [activeKey]: pauseTaskClock(old.clocks[activeKey], Date.now()),
          },
        };
      });
      setNow(Date.now());
      setNoticeState({
        scope, error: false,
        text: task.done ? "Actividad reabierta." : "Actividad marcada como realizada por vos.",
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

  const exportUpdated = () => {
    if (!runner || busy) return;
    downloadPlan(runner.plan);
    setNoticeState({
      scope, error: false,
      text: "Plan actualizado exportado. Conservá el JSON para continuar en otro dispositivo.",
    });
  };

  const back = subjectId
    ? "/study/session?subjectId=" + encodeURIComponent(subjectId) : "/study";

  return (
    <section className="study-runner" aria-labelledby="study-runner-title">
      <header className="study-runner-header">
        <div>
          <p className="study-runner-kicker">Mesa de estudio · Modo concentración</p>
          <h1 id="study-runner-title">Realizar mi sesión</h1>
          <p>Seguí tu plan a tu ritmo. El temporizador es opcional y no marca tareas automáticamente.</p>
        </div>
        <Link to={back}>Volver al Planificador</Link>
      </header>
      {status !== "authenticated" || !context || context.loading ? (
        <p role="status">Comprobando tu sesión y contexto académico…</p>
      ) : context.error ? (
        <div role="alert" className="study-runner-notice">
          <p>{context.error}</p>
          <button type="button" onClick={() => void loadContext()}>Reintentar</button>
        </div>
      ) : !subjectId ? (
        <div className="study-runner-panel">
          <h2>Seleccioná una materia actual</h2>
          <p>Este enlace no incluye una materia válida dentro de tu contexto académico.</p>
          <Link to="/study">Ir a la Mesa de estudio</Link>
        </div>
      ) : (
        <>
          <div className="study-runner-subject">
            <strong>{subject?.name}</strong>
            <Link to={studySubjectHref(subjectId) ?? "/study"}>Ver mi Mesa</Link>
          </div>
          <section className="study-runner-panel" aria-labelledby="study-run-load">
            <h2 id="study-run-load">Mi plan</h2>
            <p>
              Al entrar desde el Planificador se recupera el borrador de esta pestaña.
              También podés importar su JSON. Los permisos se vuelven a comprobar;
              no se guardan títulos ni respuestas en el navegador.
            </p>
            <div className="study-runner-actions">
              <label>
                Importar una sesión JSON
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => void onFile(event)}
                  disabled={Boolean(busy)}
                />
              </label>
              {runner && (
                <>
                  <button type="button" disabled={Boolean(busy)}
                    onClick={() => void loadPlan(runner.plan, false)}>
                    Verificar accesos otra vez
                  </button>
                  <button type="button" disabled={Boolean(busy)} onClick={exportUpdated}>
                    Exportar progreso JSON
                  </button>
                </>
              )}
            </div>
            {busy?.kind === "load" && <p role="status">Verificando actividades…</p>}
            {notice && (
              <p className={notice.error ? "study-runner-notice" : "study-runner-success"}
                role={notice.error ? "alert" : "status"}>
                {notice.text}
              </p>
            )}
          </section>
          {!runner ? (
            <div className="study-runner-panel">
              <h2>No hay una sesión activa</h2>
              <p>Prepará un plan con actividades y elegí «Realizar esta sesión», o importá uno compatible.</p>
              <Link to={back}>Preparar mi sesión</Link>
            </div>
          ) : (
            <div className="study-runner-grid">
              <section className="study-runner-panel" aria-labelledby="study-run-current">
                <h2 id="study-run-current">{runner.plan.title}</h2>
                <p className="study-runner-progress" aria-live="polite">
                  {stats?.done} de {stats?.total} actividades realizadas · {stats?.doneMinutes} de {stats?.totalMinutes} minutos planificados
                </p>
                {runner.plan.notes && (
                  <p className="study-runner-notes"><strong>Objetivo:</strong> {runner.plan.notes}</p>
                )}
                {task && (
                  <div className="study-runner-current">
                    <p>Actividad {runner.index + 1} de {runner.plan.tasks.length} · {task.kind === "question" ? "Pregunta" : "Apunte"}</p>
                    <h3>{label ?? "Contenido sin acceso confirmado"}</h3>
                    <p>{task.minutes} minutos previstos · {task.done ? "Realizada" : "Pendiente"}</p>
                    {label ? (
                      <Link to={task.kind === "resource"
                        ? "/resources/" + encodeURIComponent(task.id)
                        : "/questions?id=" + encodeURIComponent(task.id)}
                        target="_blank" rel="noopener noreferrer">
                        Abrir contenido en otra pestaña
                      </Link>
                    ) : (
                      <p role="alert">No marques esta actividad sin recuperar su acceso vigente.</p>
                    )}
                    <div className="study-runner-clock" role="timer" aria-label="Tiempo disponible en la actividad">
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
                      <button type="button" disabled={Boolean(busy) || !label || task.done || remainingMs === 0}
                        onClick={() => changeClock("toggle")}>
                        {activeClock?.startedAt === null ? "Iniciar o reanudar" : "Pausar"}
                      </button>
                      <button type="button" disabled={Boolean(busy) || !label || task.done}
                        onClick={() => changeClock("reset")}>Reiniciar tiempo</button>
                      <button type="button" disabled={Boolean(busy) || !label}
                        onClick={() => void confirmDone()}>
                        {task.done ? "Marcar pendiente" : "Marcar como realizada"}
                      </button>
                    </div>
                    {busy?.kind === "confirm" && <p role="status">Comprobando acceso antes de guardar la marca…</p>}
                    <div className="study-runner-navigation">
                      <button type="button" disabled={Boolean(busy) || runner.index === 0}
                        onClick={() => move(runner.index - 1)}>Anterior</button>
                      <button type="button" disabled={Boolean(busy) || runner.index === runner.plan.tasks.length - 1}
                        onClick={() => move(runner.index + 1)}>Siguiente</button>
                    </div>
                  </div>
                )}
              </section>
              <section className="study-runner-panel" aria-labelledby="study-run-list">
                <h2 id="study-run-list">Actividades del plan</h2>
                <ol className="study-runner-list">
                  {runner.plan.tasks.map((item, index) => {
                    const key = keyOf(item);
                    const itemLabel = runner.labels[key];
                    return (
                      <li key={key}>
                        <button type="button" disabled={Boolean(busy)}
                          aria-current={index === runner.index ? "step" : undefined}
                          onClick={() => move(index)}>
                          <span>{index + 1}. {itemLabel ?? "Sin acceso"}</span>
                          <small>{item.done ? "Realizada" : itemLabel ? "Pendiente" : "Requiere acceso"} · {item.minutes} min</small>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <p className="study-runner-help">
                  Las marcas son autodeclaradas. Los tiempos no se guardan en el JSON;
                  al cambiar de actividad se pausa su temporizador. El progreso se conserva
                  únicamente en esta pestaña hasta que exportes el archivo.
                </p>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
