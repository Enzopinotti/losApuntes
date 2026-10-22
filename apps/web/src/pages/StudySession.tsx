import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { useAuth } from "../contexts/useAuth";
import type { QuestionView } from "../features/community/interfaces";
import {
  communityApi,
  isCommunityApiError,
} from "../features/community/services/communityService";
import type { ResourceView } from "../features/resources/interfaces";
import {
  isResourcesApiError,
  resourcesApi,
} from "../features/resources/services/resourcesService";
import type { ContextualDiscoveryResponse } from "../features/search/interfaces";
import {
  isSearchApiError,
  searchApi,
} from "../features/search/services/searchService";
import {
  buildStudySessionCalendar,
  buildStudySessionMarkdown,
  emptyStudySession,
  normalizeStudySession,
  readStudySession,
  serializeStudySession,
  STUDY_SESSION_MAX_TASKS,
  STUDY_SESSION_MAX_MINUTES,
  type StudySession,
  type StudySessionTask,
} from "../features/study/study-session-plan.mjs";
import {
  recallStudyDraft,
  rememberStudyDraft,
} from "../features/study/study-session-draft.mjs";
import {
  finishStudyHandoff,
  inspectStudyHandoff,
  isStudyHandoffRouteState,
  mergeStudySessionHandoff,
} from "../features/study/study-session-handoff.mjs";
import {
  resolveStudySubject,
  studySubjectHref,
  studySubjectSelectionFromParams,
} from "../features/study/study-subject-navigation.mjs";
import { StudyPlanMaterialFinder } from "../features/study/StudyPlanMaterialFinder";
import { studySessionCursorRepeats } from "../features/study/study-session-source-pagination";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./StudySession.scss";

type Catalog<T> = {
  scope: string;
  items: T[];
  cursor: string | null;
  loading: boolean;
  error: string | null;
  cursorCycle: boolean;
};
type Context = {
  scope: string;
  data: ContextualDiscoveryResponse | null;
  loading: boolean;
  error: string | null;
};
type Draft = {
  scope: string;
  plan: StudySession;
  labels: Record<string, string | null>;
};
type Status = {
  scope: string;
  text: string;
  error: boolean;
};

function apiError(error: unknown): string {
  if (
    isSearchApiError(error) ||
    isResourcesApiError(error) ||
    isCommunityApiError(error)
  ) {
    if (error.status === 401) return "La sesión ya no está activa.";
    if (error.status === 403 || error.status === 404) {
      return "El material dejó de estar disponible o accesible.";
    }
    return error.message;
  }
  if (error instanceof Error && error.message.startsWith("STUDY_SESSION_")) {
    return "El plan es inválido, supera los límites o está en un formato no compatible.";
  }
  return "No pudimos completar la operación. Revisá la conexión y reintentá.";
}

function taskKey(task: Pick<StudySessionTask, "kind" | "id">): string {
  return `${task.kind}:${task.id}`;
}

function combineUnique<T extends { id: string }>(one: T[], two: T[]): T[] {
  return Array.from(
    new Map([...one, ...two].map((value) => [value.id, value])).values(),
  );
}

function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Always resolve imported/portable IDs again. Never trust labels in a file. */
async function verifyTaskLabels(
  plan: StudySession,
  signal: AbortSignal,
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  let index = 0;
  const workers = Array.from(
    { length: Math.min(4, plan.tasks.length) },
    async () => {
      while (index < plan.tasks.length) {
        const task = plan.tasks[index++];
        if (!task || signal.aborted) return;
        let label: string | null = null;
        try {
          if (task.kind === "resource") {
            const response = await resourcesApi.get(task.id, signal);
            if (response.resource.academic.subject.id === plan.subjectId) {
              label = response.resource.title;
            }
          } else {
            const response = await communityApi.question(task.id, signal);
            if (response.question.academic.subject.id === plan.subjectId) {
              label = response.question.title;
            }
          }
        } catch (error) {
          if (signal.aborted) return;
          if (
            (isResourcesApiError(error) || isCommunityApiError(error)) &&
            (error.status === 403 || error.status === 404)
          ) {
            label = null;
          } else {
            throw error;
          }
        }
        result[taskKey(task)] = label;
      }
    },
  );
  await Promise.all(workers);
  return result;
}

export default function StudySession() {
  const { status, user, session } = useAuth();
  const location = useLocation();
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
  const subject = resolution?.kind === "ready" ? resolution.subject : null;
  const subjectId = subject?.id ?? null;
  const scope = `${authScope}:${subjectId ?? "none"}`;
  const incomingHandoff = subjectId
    ? inspectStudyHandoff(location.state, scope, subjectId)
    : null;
  const hasRouteHandoff = isStudyHandoffRouteState(location.state);

  const [savedState, setSavedState] = useState<Catalog<ResourceView> | null>(
    null,
  );
  const [foundState, setFoundState] = useState<Catalog<ResourceView> | null>(
    null,
  );
  const [questionState, setQuestionState] =
    useState<Catalog<QuestionView> | null>(null);
  const savedCursors = useRef({ scope, values: new Set<string>() });
  const foundCursors = useRef({ scope, values: new Set<string>() });
  const questionCursors = useRef({ scope, values: new Set<string>() });
  const saved = savedState?.scope === scope ? savedState : null;
  const found = foundState?.scope === scope ? foundState : null;
  const questions = questionState?.scope === scope ? questionState : null;

  const [draftState, setDraftState] = useState<Draft | null>(null);
  // Restore only this exact user/session/subject, never a former account.
  const resumedPlan = subjectId ? recallStudyDraft(scope, subjectId) : null;
  const plan = subjectId
    ? draftState?.scope === scope
      ? draftState.plan
      : (resumedPlan ?? emptyStudySession(subjectId))
    : null;
  const labels: Record<string, string | null> =
    draftState?.scope === scope ? draftState.labels : {};
  useEffect(() => {
    if (
      status === "authenticated" &&
      subjectId &&
      draftState?.scope === scope
    ) {
      // Only user-authored fields/opaque IDs. No cached server resource titles.
      rememberStudyDraft(scope, draftState.plan);
    }
  }, [status, subjectId, scope, draftState]);

  const [feedback, setFeedback] = useState<Status | null>(null);
  const [busy, setBusy] = useState<Status | null>(null);
  const currentFeedback = feedback?.scope === scope ? feedback : null;
  const isBusy = busy?.scope === scope;
  const busyRef = useRef<{ scope: string; epoch: number } | null>(null);

  const {
    begin: beginContext,
    isCurrent: contextCurrent,
    finish: finishContext,
  } = useAsyncAuthorityFence(`session-context:${authScope}`);
  const {
    begin: beginSaved,
    isCurrent: savedCurrent,
    finish: finishSaved,
  } = useAsyncAuthorityFence(`session-saved:${scope}`);
  const {
    begin: beginFound,
    isCurrent: foundCurrent,
    finish: finishFound,
  } = useAsyncAuthorityFence(`session-discovery:${scope}`);
  const {
    begin: beginQuestions,
    isCurrent: questionsCurrent,
    finish: finishQuestions,
  } = useAsyncAuthorityFence(`session-questions:${scope}`);
  const {
    begin: beginAction,
    isCurrent: actionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(`session-action:${scope}`);

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
          error: apiError(error),
        });
      }
    } finally {
      finishContext(ticket);
    }
  }, [status, authScope, beginContext, contextCurrent, finishContext]);

  const loadSaved = useCallback(
    async (cursor?: string) => {
      if (!subjectId) return;
      const ticket = beginSaved();
      if (!savedCurrent(ticket)) return;
      setSavedState((old) => ({
        scope,
        items: old?.scope === scope ? old.items : [],
        cursor: old?.scope === scope ? old.cursor : null,
        loading: true,
        error: null,
        cursorCycle: old?.scope === scope ? old.cursorCycle : false,
      }));
      try {
        const page = await resourcesApi.savedBySubject(
          subjectId,
          cursor,
          ticket.signal,
        );
        if (savedCurrent(ticket)) {
          const used =
            savedCursors.current.scope === scope
              ? savedCursors.current.values
              : new Set<string>();
          if (
            cursor &&
            studySessionCursorRepeats(used, cursor, page.nextCursor)
          ) {
            const values = new Set(used);
            values.add(cursor);
            savedCursors.current = { scope, values };
            setSavedState((old) => ({
              scope,
              items: combineUnique(
                old?.scope === scope ? old.items : [],
                page.items,
              ),
              cursor: null,
              loading: false,
              error:
                "Los apuntes guardados repitieron una página. Actualizá las fuentes para continuar.",
              cursorCycle: true,
            }));
            return;
          }
          if (cursor) {
            const values = new Set(used);
            values.add(cursor);
            savedCursors.current = { scope, values };
          } else {
            savedCursors.current = { scope, values: new Set<string>() };
          }
          setSavedState((old) => ({
            scope,
            items:
              cursor && old?.scope === scope
                ? combineUnique(old.items, page.items)
                : page.items,
            cursor: page.nextCursor,
            loading: false,
            error: null,
            cursorCycle: false,
          }));
        }
      } catch (error) {
        if (savedCurrent(ticket)) {
          const accessRevoked =
            isResourcesApiError(error) &&
            [401, 403, 404].includes(error.status);
          if (accessRevoked) {
            savedCursors.current = { scope, values: new Set<string>() };
          }
          setSavedState((old) => ({
            scope,
            items: old?.scope === scope && !accessRevoked ? old.items : [],
            cursor: old?.scope === scope && !accessRevoked ? old.cursor : null,
            loading: false,
            error: apiError(error),
            cursorCycle:
              old?.scope === scope && !accessRevoked ? old.cursorCycle : false,
          }));
        }
      } finally {
        finishSaved(ticket);
      }
    },
    [subjectId, scope, beginSaved, savedCurrent, finishSaved],
  );

  const loadFound = useCallback(
    async (cursor?: string) => {
      if (!subjectId) return;
      const ticket = beginFound();
      if (!foundCurrent(ticket)) return;
      setFoundState((old) => ({
        scope,
        items: old?.scope === scope ? old.items : [],
        cursor: old?.scope === scope ? old.cursor : null,
        loading: true,
        error: null,
        cursorCycle: old?.scope === scope ? old.cursorCycle : false,
      }));
      try {
        const page = await resourcesApi.search(
          { subjectId, cursor },
          ticket.signal,
        );
        if (foundCurrent(ticket)) {
          const used =
            foundCursors.current.scope === scope
              ? foundCursors.current.values
              : new Set<string>();
          if (
            cursor &&
            studySessionCursorRepeats(used, cursor, page.nextCursor)
          ) {
            const values = new Set(used);
            values.add(cursor);
            foundCursors.current = { scope, values };
            setFoundState((old) => ({
              scope,
              items: combineUnique(
                old?.scope === scope ? old.items : [],
                page.items,
              ),
              cursor: null,
              loading: false,
              error:
                "Los apuntes disponibles repitieron una página. Actualizá las fuentes para continuar.",
              cursorCycle: true,
            }));
            return;
          }
          if (cursor) {
            const values = new Set(used);
            values.add(cursor);
            foundCursors.current = { scope, values };
          } else {
            foundCursors.current = { scope, values: new Set<string>() };
          }
          setFoundState((old) => ({
            scope,
            items:
              cursor && old?.scope === scope
                ? combineUnique(old.items, page.items)
                : page.items,
            cursor: page.nextCursor,
            loading: false,
            error: null,
            cursorCycle: false,
          }));
        }
      } catch (error) {
        if (foundCurrent(ticket)) {
          const accessRevoked =
            isSearchApiError(error) && [401, 403, 404].includes(error.status);
          if (accessRevoked) {
            foundCursors.current = { scope, values: new Set<string>() };
          }
          setFoundState((old) => ({
            scope,
            items: old?.scope === scope && !accessRevoked ? old.items : [],
            cursor: old?.scope === scope && !accessRevoked ? old.cursor : null,
            loading: false,
            error: apiError(error),
            cursorCycle:
              old?.scope === scope && !accessRevoked ? old.cursorCycle : false,
          }));
        }
      } finally {
        finishFound(ticket);
      }
    },
    [subjectId, scope, beginFound, foundCurrent, finishFound],
  );

  const loadQuestions = useCallback(
    async (cursor?: string) => {
      if (!subjectId) return;
      const ticket = beginQuestions();
      if (!questionsCurrent(ticket)) return;
      setQuestionState((old) => ({
        scope,
        items: old?.scope === scope ? old.items : [],
        cursor: old?.scope === scope ? old.cursor : null,
        loading: true,
        error: null,
        cursorCycle: old?.scope === scope ? old.cursorCycle : false,
      }));
      try {
        const page = await communityApi.questions(
          { subjectId, limit: 15, cursor },
          ticket.signal,
        );
        if (questionsCurrent(ticket)) {
          const used =
            questionCursors.current.scope === scope
              ? questionCursors.current.values
              : new Set<string>();
          if (
            cursor &&
            studySessionCursorRepeats(used, cursor, page.nextCursor)
          ) {
            const values = new Set(used);
            values.add(cursor);
            questionCursors.current = { scope, values };
            setQuestionState((old) => ({
              scope,
              items: combineUnique(
                old?.scope === scope ? old.items : [],
                page.items,
              ),
              cursor: null,
              loading: false,
              error:
                "Las preguntas de la materia repitieron una página. Actualizá las fuentes para continuar.",
              cursorCycle: true,
            }));
            return;
          }
          if (cursor) {
            const values = new Set(used);
            values.add(cursor);
            questionCursors.current = { scope, values };
          } else {
            questionCursors.current = { scope, values: new Set<string>() };
          }
          setQuestionState((old) => ({
            scope,
            items:
              cursor && old?.scope === scope
                ? combineUnique(old.items, page.items)
                : page.items,
            cursor: page.nextCursor,
            loading: false,
            error: null,
            cursorCycle: false,
          }));
        }
      } catch (error) {
        if (questionsCurrent(ticket)) {
          const accessRevoked =
            isCommunityApiError(error) &&
            [401, 403, 404].includes(error.status);
          if (accessRevoked) {
            questionCursors.current = { scope, values: new Set<string>() };
          }
          setQuestionState((old) => ({
            scope,
            items: old?.scope === scope && !accessRevoked ? old.items : [],
            cursor: old?.scope === scope && !accessRevoked ? old.cursor : null,
            loading: false,
            error: apiError(error),
            cursorCycle:
              old?.scope === scope && !accessRevoked ? old.cursorCycle : false,
          }));
        }
      } finally {
        finishQuestions(ticket);
      }
    },
    [subjectId, scope, beginQuestions, questionsCurrent, finishQuestions],
  );

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (!subjectId) return;
    void loadSaved();
    void loadFound();
    void loadQuestions();
  }, [subjectId, loadSaved, loadFound, loadQuestions]);

  const edit = (transform: (draft: StudySession) => StudySession) => {
    if (!subjectId || isBusy) return;
    setDraftState((old) => {
      const draft =
        old?.scope === scope
          ? old
          : {
              scope,
              plan: plan ?? emptyStudySession(subjectId),
              labels: {},
            };
      return { ...draft, plan: transform(draft.plan) };
    });
    setFeedback(null);
  };

  const appendTask = (task: StudySessionTask, title: string) => {
    if (!subjectId || isBusy) return;
    const key = taskKey(task);
    setDraftState((old) => {
      const draft =
        old?.scope === scope
          ? old
          : {
              scope,
              plan: plan ?? emptyStudySession(subjectId),
              labels: {},
            };
      if (
        draft.plan.tasks.length >= STUDY_SESSION_MAX_TASKS ||
        draft.plan.tasks.some((current) => taskKey(current) === key) ||
        draft.plan.tasks.reduce(
          (sum, current) => sum + current.minutes,
          task.minutes,
        ) > STUDY_SESSION_MAX_MINUTES
      )
        return draft;
      return {
        scope,
        plan: { ...draft.plan, tasks: [...draft.plan.tasks, task] },
        labels: { ...draft.labels, [key]: title },
      };
    });
  };

  const removeTask = (index: number) => {
    edit((draft) => ({
      ...draft,
      tasks: draft.tasks.filter((_, position) => position !== index),
    }));
  };

  const moveTask = (index: number, direction: -1 | 1) => {
    edit((draft) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= draft.tasks.length) return draft;
      const tasks = [...draft.tasks];
      [tasks[index], tasks[newIndex]] = [tasks[newIndex], tasks[index]];
      return { ...draft, tasks };
    });
  };

  const startAction = () => {
    if (!subjectId || !plan || busyRef.current?.scope === scope) return null;
    const ticket = beginAction();
    if (!actionCurrent(ticket)) return null;
    busyRef.current = { scope, epoch: ticket.epoch };
    setBusy({ scope, text: "Comprobando el plan…", error: false });
    setFeedback(null);
    return ticket;
  };
  const finishActionSafely = (ticket: {
    scopeKey: string;
    epoch: number;
    signal: AbortSignal;
  }) => {
    if (
      busyRef.current?.scope === scope &&
      busyRef.current.epoch === ticket.epoch
    ) {
      busyRef.current = null;
    }
    if (finishAction(ticket)) setBusy(null);
  };

  const updateTaskAuthorities = (
    value: StudySession,
    nextLabels: Record<string, string | null>,
  ) => {
    setDraftState({ scope, plan: value, labels: nextLabels });
  };

  const importFile = async (file: File) => {
    const ticket = startAction();
    if (!ticket || !subjectId) return;
    try {
      if (file.size > 64000) throw new Error("STUDY_SESSION_FILE_TOO_LARGE");
      const imported = readStudySession(await file.text());
      if (imported.subjectId !== subjectId) {
        throw new Error("STUDY_SESSION_SUBJECT_MISMATCH");
      }
      if (!actionCurrent(ticket)) return;
      const verified = await verifyTaskLabels(imported, ticket.signal);
      if (!actionCurrent(ticket)) return;
      updateTaskAuthorities(imported, verified);
      const missing = Object.values(verified).filter(
        (value) => value === null,
      ).length;
      setFeedback({
        scope,
        error: false,
        text: missing
          ? `Plan importado. Hay ${missing} referencias inaccesibles que podés quitar.`
          : "Plan importado y contenido comprobado con el servidor.",
      });
    } catch (error) {
      if (actionCurrent(ticket)) {
        setFeedback({ scope, error: true, text: apiError(error) });
      }
    } finally {
      finishActionSafely(ticket);
    }
  };

  const applyDirectHandoff = async (mode: "append" | "replace") => {
    if (!subjectId || !plan || !incomingHandoff || isBusy) return;
    if (
      mode === "replace" &&
      (plan.tasks.length > 0 || plan.notes.trim().length > 0) &&
      !window.confirm(
        "¿Reemplazar el plan actual? Se perderán tus actividades y notas temporales.",
      )
    )
      return;

    const ticket = startAction();
    if (!ticket) return;
    try {
      // Route state carries only a nonce. Re-inspect after the action starts:
      // another account/session or an expired handoff must not be consumed.
      const incoming = inspectStudyHandoff(location.state, scope, subjectId);
      if (!incoming) throw new Error("STUDY_HANDOFF_EXPIRED");
      const candidate =
        mode === "append"
          ? mergeStudySessionHandoff(plan, incoming)
          : {
              plan: normalizeStudySession(incoming),
              added: incoming.tasks.length,
            };
      if (!actionCurrent(ticket)) return;
      const verified = await verifyTaskLabels(candidate.plan, ticket.signal);
      if (!actionCurrent(ticket)) return;
      updateTaskAuthorities(candidate.plan, verified);
      const missing = Object.values(verified).filter(
        (value) => value === null,
      ).length;
      finishStudyHandoff(location.state, scope);
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
      setFeedback({
        scope,
        error: missing > 0,
        text:
          missing > 0
            ? `Se incorporaron ${candidate.added} actividades, pero hay ${missing} referencias sin acceso vigente. Podés quitarlas.`
            : candidate.added === 0
              ? "Las actividades ya estaban en el plan. Se actualizaron los permisos."
              : `Se incorporaron ${candidate.added} actividades verificadas. Podés continuar planificando.`,
      });
    } catch (error) {
      if (actionCurrent(ticket)) {
        setFeedback({
          scope,
          error: true,
          text:
            error instanceof Error &&
            error.message === "STUDY_HANDOFF_TASK_LIMIT"
              ? "El plan superaría las 24 actividades. Quitá algunas antes de agregar."
              : error instanceof Error &&
                  error.message === "STUDY_HANDOFF_TIME_LIMIT"
                ? "El plan superaría 1.200 minutos. Ajustá los tiempos antes de agregar."
                : error instanceof Error &&
                    error.message === "STUDY_HANDOFF_EXPIRED"
                  ? "La transferencia venció o pertenece a otra sesión. Volvé a Práctica."
                  : apiError(error),
        });
      }
    } finally {
      finishActionSafely(ticket);
    }
  };

  const dismissDirectHandoff = () => {
    if (isBusy) return;
    finishStudyHandoff(location.state, scope);
    navigate(location.pathname + location.search, {
      replace: true,
      state: null,
    });
  };

  const checkAccess = async () => {
    const ticket = startAction();
    if (!ticket || !plan) return;
    try {
      const normalized = normalizeStudySession(plan);
      const fresh = await verifyTaskLabels(normalized, ticket.signal);
      if (!actionCurrent(ticket)) return;
      updateTaskAuthorities(normalized, fresh);
      const missing = Object.values(fresh).filter(
        (value) => value === null,
      ).length;
      setFeedback({
        scope,
        error: missing > 0,
        text:
          missing > 0
            ? `${missing} actividades ya no están disponibles. Podés quitarlas del plan.`
            : "Todos los materiales fueron comprobados con permisos actuales.",
      });
    } catch (error) {
      if (actionCurrent(ticket)) {
        setFeedback({ scope, error: true, text: apiError(error) });
      }
    } finally {
      finishActionSafely(ticket);
    }
  };

  const exportFile = async (kind: "json" | "markdown" | "calendar") => {
    const ticket = startAction();
    if (!ticket || !plan) return;
    try {
      const normalized = normalizeStudySession(plan);
      if (kind === "json") {
        if (!actionCurrent(ticket)) return;
        downloadText(
          "los-apuntes-sesion.json",
          serializeStudySession(normalized),
          "application/json;charset=utf-8",
        );
      } else {
        const fresh = await verifyTaskLabels(normalized, ticket.signal);
        if (!actionCurrent(ticket)) return;
        const names = normalized.tasks.map(
          (task) => fresh[taskKey(task)] ?? null,
        );
        if (names.some((label) => label === null)) {
          updateTaskAuthorities(normalized, fresh);
          throw new Error("STUDY_SESSION_AUTHORITY_REQUIRED");
        }
        const verifiedNames = names.filter(
          (value): value is string => value !== null,
        );
        const contents =
          kind === "markdown"
            ? buildStudySessionMarkdown(normalized, verifiedNames)
            : buildStudySessionCalendar(
                normalized,
                verifiedNames,
                crypto.randomUUID(),
                new Date(),
              );
        if (!actionCurrent(ticket)) return;
        downloadText(
          kind === "markdown"
            ? "los-apuntes-sesion.md"
            : "los-apuntes-sesion.ics",
          contents,
          kind === "markdown"
            ? "text/markdown;charset=utf-8"
            : "text/calendar;charset=utf-8",
        );
        updateTaskAuthorities(normalized, fresh);
      }
      if (actionCurrent(ticket)) {
        setFeedback({
          scope,
          error: false,
          text: "Archivo preparado. Revisá las descargas del navegador.",
        });
      }
    } catch (error) {
      if (actionCurrent(ticket)) {
        setFeedback({ scope, error: true, text: apiError(error) });
      }
    } finally {
      finishActionSafely(ticket);
    }
  };

  const activeTasks = plan?.tasks ?? [];
  const known = new Set(activeTasks.map(taskKey));
  const resourceOptions = combineUnique(saved?.items ?? [], found?.items ?? []);
  const questionOptions = questions?.items ?? [];
  const summaries = activeTasks.map((task) => {
    const key = taskKey(task);
    if (Object.prototype.hasOwnProperty.call(labels, key)) {
      return labels[key];
    }
    const row =
      task.kind === "resource"
        ? resourceOptions.find((value) => value.id === task.id)
        : questionOptions.find((value) => value.id === task.id);
    return row?.title ?? null;
  });
  // Live completion count is local, never a gamified public metric.
  // Keep incomplete drafts renderable. The schema is validated only when
  // importing, verifying or exporting a completed plan.
  const totalMinutes = activeTasks.reduce(
    (total, task) => total + task.minutes,
    0,
  );
  const reviewedMinutes = activeTasks.reduce(
    (total, task) => total + (task.done ? task.minutes : 0),
    0,
  );
  const overBudget = totalMinutes > STUDY_SESSION_MAX_MINUTES;

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (chosen) void importFile(chosen);
  };

  return (
    <section
      className="study-session-page"
      aria-labelledby="study-session-title"
    >
      <header className="study-session-heading">
        <div>
          <p className="study-session-eyebrow">
            Mesa de estudio · Herramienta personal
          </p>
          <h1 id="study-session-title">Preparar una sesión</h1>
          <p>
            Elegí qué repasar, cuánto tiempo dedicarle y qué ya resolviste. No
            hay cronómetros compulsivos ni calificaciones inventadas.
          </p>
        </div>
        <div className="study-session-quick-actions">
          {subjectId && (
            <Link
              to={`/study/practice?subjectId=${encodeURIComponent(subjectId)}`}
              onClick={() => {
                // Snapshot before route unmount, including the last edited key.
                if (plan) rememberStudyDraft(scope, plan);
              }}
            >
              Practicar preguntas
            </Link>
          )}
          {subjectId && (
            <Link
              to={`/study/kits?subjectId=${encodeURIComponent(subjectId)}`}
              onClick={() => {
                if (plan) rememberStudyDraft(scope, plan);
              }}
            >
              Mis colecciones portátiles
            </Link>
          )}
          <Link
            to={
              subjectId ? (studySubjectHref(subjectId) ?? "/study") : "/study"
            }
          >
            Volver a la Mesa
          </Link>
        </div>
      </header>
      {status !== "authenticated" || !context || context.loading ? (
        <p role="status">Preparando tus materias…</p>
      ) : context.error ? (
        <div role="alert" className="study-session-alert">
          <p>{context.error}</p>
          <button type="button" onClick={() => void loadContext()}>
            Reintentar
          </button>
        </div>
      ) : resolution?.kind !== "ready" || !subject || !plan ? (
        <div className="study-session-empty">
          <h2>No hay una materia disponible para esta sesión</h2>
          <p>
            La selección debe pertenecer a las primeras ocho materias actuales
            de tu contexto académico y tener un enlace válido.
          </p>
          <Link to="/study">Elegir materia desde mi Mesa</Link>
        </div>
      ) : (
        <>
          <div className="study-session-context">
            <strong>Materia: {subject.name}</strong>
            <span>
              Plan temporal: no se guarda en servidores ni en este navegador.
            </span>
          </div>
          {hasRouteHandoff && (
            <section
              className="study-session-panel study-session-handoff"
              aria-labelledby="study-session-handoff-title"
            >
              <h2 id="study-session-handoff-title">
                Continuar desde otra herramienta de estudio
              </h2>
              {incomingHandoff ? (
                <>
                  <p>
                    Hay {incomingHandoff.tasks.length} actividades de repaso
                    listas para incorporar a esta materia. Antes de mostrarlas,
                    el servidor volverá a verificar sus permisos.
                  </p>
                  <div className="study-session-export-actions">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void applyDirectHandoff("append")}
                    >
                      Sumar actividades sin perder mi plan
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void applyDirectHandoff("replace")}
                    >
                      Reemplazar por el repaso
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={dismissDirectHandoff}
                    >
                      Descartar transferencia
                    </button>
                  </div>
                  <p className="study-session-info">
                    Al sumar, se conservan tus notas, tiempos y actividades
                    revisadas. Las referencias repetidas no se agregan dos
                    veces. Si querés volver a realizar actividades ya incluidas
                    y marcadas, elegí «Reemplazar por el repaso» para dejarlas
                    pendientes.
                  </p>
                </>
              ) : (
                <>
                  <p className="study-session-info" role="status">
                    Este pase directo ya venció o pertenece a otra sesión. Podés
                    volver a la herramienta anterior o importar el JSON
                    descargado.
                  </p>
                  <button type="button" onClick={dismissDirectHandoff}>
                    Cerrar aviso
                  </button>
                </>
              )}
            </section>
          )}
          <div className="study-session-grid">
            <section
              className="study-session-panel"
              aria-labelledby="study-session-editor"
            >
              <h2 id="study-session-editor">1. Definí tu sesión</h2>
              <label>
                Nombre
                <input
                  maxLength={100}
                  value={plan.title}
                  onChange={(event) =>
                    edit((value) => ({ ...value, title: event.target.value }))
                  }
                  disabled={isBusy}
                />
              </label>
              <label>
                Inicio previsto (opcional, para calendario)
                <input
                  type="datetime-local"
                  value={plan.startsAt ?? ""}
                  onChange={(event) =>
                    edit((value) => ({
                      ...value,
                      startsAt: event.target.value || null,
                    }))
                  }
                  disabled={isBusy}
                />
              </label>
              <label>
                Notas personales (máximo 500 caracteres)
                <textarea
                  rows={3}
                  maxLength={500}
                  value={plan.notes}
                  onChange={(event) =>
                    edit((value) => ({ ...value, notes: event.target.value }))
                  }
                  disabled={isBusy}
                />
              </label>
              <div className="study-session-summary" aria-live="polite">
                <strong>{activeTasks.length} actividades</strong>
                <span>{totalMinutes} minutos previstos</span>
                <span>
                  {activeTasks.filter((task) => task.done).length} revisadas
                </span>
                <span>{totalMinutes - reviewedMinutes} minutos pendientes</span>
              </div>
              <p className="study-session-info">
                Los tiempos y casillas son autodeclarados: no representan
                asistencia ni resultados de examen.
              </p>
              <p className="study-session-info">
                El borrador se recuerda mientras navegás entre Práctica y el
                Planificador en esta pestaña (máximo 30 minutos). Recargar
                descarta esa memoria. Para guardarlo, exportá JSON.
              </p>
              <button
                type="button"
                className="study-session-secondary"
                disabled={isBusy}
                onClick={() => {
                  // The academic context can change between render and click.
                  // Do not create a draft for a missing or revoked subject.
                  if (!subjectId) return;
                  if (
                    !window.confirm(
                      "¿Vaciar el borrador temporal? Se perderán sus notas y actividades.",
                    )
                  )
                    return;
                  setDraftState({
                    scope,
                    plan: emptyStudySession(subjectId),
                    labels: {},
                  });
                  setFeedback({
                    scope,
                    error: false,
                    text: "Borrador temporal vaciado.",
                  });
                }}
              >
                Vaciar mi borrador
              </button>
              {overBudget && (
                <p className="study-session-alert" role="alert">
                  El plan supera el máximo de 1.200 minutos. Ajustá las
                  duraciones antes de exportar.
                </p>
              )}
              <h3>Actividades en orden</h3>
              {activeTasks.length === 0 ? (
                <p>
                  Agregá apuntes o preguntas desde las listas de la derecha.
                </p>
              ) : (
                <ol className="study-session-tasks">
                  {activeTasks.map((task, index) => (
                    <li key={taskKey(task)}>
                      <div className="study-session-task-heading">
                        <input
                          type="checkbox"
                          aria-label={`Marcar actividad ${index + 1} como revisada`}
                          checked={task.done}
                          disabled={isBusy}
                          onChange={(event) =>
                            edit((draft) => ({
                              ...draft,
                              tasks: draft.tasks.map((item, i) =>
                                i === index
                                  ? { ...item, done: event.target.checked }
                                  : item,
                              ),
                            }))
                          }
                        />
                        <div>
                          <strong>
                            {summaries[index] ??
                              "Contenido sin acceso confirmado"}
                          </strong>
                          <small>
                            {task.kind === "resource" ? "Apunte" : "Pregunta"}
                          </small>
                        </div>
                      </div>
                      <div className="study-session-task-controls">
                        <label>
                          Minutos
                          <select
                            value={task.minutes}
                            disabled={isBusy}
                            onChange={(event) =>
                              edit((draft) => ({
                                ...draft,
                                tasks: draft.tasks.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        minutes: Number(event.target.value),
                                      }
                                    : item,
                                ),
                              }))
                            }
                          >
                            {[10, 15, 20, 25, 30, 45, 60, 75, 90, 120].map(
                              (amount) => (
                                <option key={amount} value={amount}>
                                  {amount}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={isBusy || index === 0}
                          onClick={() => moveTask(index, -1)}
                        >
                          Subir
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || index === activeTasks.length - 1}
                          onClick={() => moveTask(index, 1)}
                        >
                          Bajar
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => removeTask(index)}
                        >
                          Quitar
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section
              className="study-session-panel"
              aria-labelledby="study-session-sources"
            >
              <h2 id="study-session-sources">2. Sumá material de la materia</h2>
              <p>
                Las opciones vienen de tu biblioteca y de las búsquedas
                vigentes; importar un ID no otorga permiso sobre él.
              </p>
              <StudyPlanMaterialFinder
                key={scope}
                authorityScope={scope}
                subjectId={subject.id}
                existingKeys={known}
                taskCount={activeTasks.length}
                minutesRemaining={Math.max(
                  0,
                  STUDY_SESSION_MAX_MINUTES - totalMinutes,
                )}
                maxTasks={STUDY_SESSION_MAX_TASKS}
                disabled={isBusy}
                onAdd={appendTask}
              />
              <h3>Apuntes guardados y disponibles</h3>
              {saved?.error && (
                <p role="alert" className="study-session-alert">
                  {saved.error}
                </p>
              )}
              {found?.error && (
                <p role="alert" className="study-session-alert">
                  {found.error}
                </p>
              )}
              {(saved?.loading || found?.loading) && (
                <p role="status">Consultando apuntes…</p>
              )}
              <ul className="study-session-sources">
                {resourceOptions.map((item) => (
                  <li key={item.id}>
                    <Link to={`/resources/${encodeURIComponent(item.id)}`}>
                      {item.title}
                    </Link>
                    <button
                      type="button"
                      disabled={
                        isBusy ||
                        known.has("resource:" + item.id) ||
                        activeTasks.length >= STUDY_SESSION_MAX_TASKS
                      }
                      onClick={() =>
                        appendTask(
                          {
                            kind: "resource",
                            id: item.id,
                            minutes: 25,
                            done: false,
                          },
                          item.title,
                        )
                      }
                    >
                      {known.has("resource:" + item.id)
                        ? "Agregado"
                        : "Agregar"}
                    </button>
                  </li>
                ))}
              </ul>
              {!saved?.loading && saved?.cursor && (
                <button
                  type="button"
                  onClick={() => void loadSaved(saved.cursor ?? undefined)}
                >
                  Más guardados
                </button>
              )}
              {!found?.loading && found?.cursor && (
                <button
                  type="button"
                  onClick={() => void loadFound(found.cursor ?? undefined)}
                >
                  Más apuntes
                </button>
              )}
              {saved?.cursorCycle && (
                <button
                  type="button"
                  disabled={saved.loading}
                  onClick={() => void loadSaved()}
                >
                  Actualizar guardados
                </button>
              )}
              {found?.cursorCycle && (
                <button
                  type="button"
                  disabled={found.loading}
                  onClick={() => void loadFound()}
                >
                  Actualizar disponibles
                </button>
              )}
              <h3>Preguntas</h3>
              {questions?.error && (
                <p role="alert" className="study-session-alert">
                  {questions.error}
                </p>
              )}
              {questions?.loading && (
                <p role="status">Consultando preguntas…</p>
              )}
              <ul className="study-session-sources">
                {questionOptions.map((item) => (
                  <li key={item.id}>
                    <Link to={`/questions?id=${encodeURIComponent(item.id)}`}>
                      {item.title}
                    </Link>
                    <button
                      type="button"
                      disabled={
                        isBusy ||
                        known.has("question:" + item.id) ||
                        activeTasks.length >= STUDY_SESSION_MAX_TASKS
                      }
                      onClick={() =>
                        appendTask(
                          {
                            kind: "question",
                            id: item.id,
                            minutes: 20,
                            done: false,
                          },
                          item.title,
                        )
                      }
                    >
                      {known.has("question:" + item.id)
                        ? "Agregada"
                        : "Agregar"}
                    </button>
                  </li>
                ))}
              </ul>
              {!questions?.loading && questions?.cursor && (
                <button
                  type="button"
                  onClick={() =>
                    void loadQuestions(questions.cursor ?? undefined)
                  }
                >
                  Más preguntas
                </button>
              )}
              {questions?.cursorCycle && (
                <button
                  type="button"
                  disabled={questions.loading}
                  onClick={() => void loadQuestions()}
                >
                  Actualizar preguntas
                </button>
              )}
              <div className="study-session-quick-actions">
                <button
                  type="button"
                  disabled={
                    isBusy ||
                    saved?.loading === true ||
                    found?.loading === true ||
                    questions?.loading === true
                  }
                  onClick={() => {
                    void loadSaved();
                    void loadFound();
                    void loadQuestions();
                  }}
                >
                  Actualizar fuentes
                </button>
                <Link to="/questions">Abrir preguntas completas</Link>
              </div>
            </section>
          </div>
          <section
            className="study-session-panel study-session-export"
            aria-labelledby="study-session-export-title"
          >
            <h2 id="study-session-export-title">3. Guardá o retomá tu plan</h2>
            <p>
              Esta sesión vive únicamente en memoria. Exportá JSON para
              retomarla en otro dispositivo, Markdown para estudiar sin conexión
              o un evento .ics para tu calendario. El archivo JSON no incluye
              títulos ajenos: al importarlo se revalidan todas las referencias.
            </p>
            <div className="study-session-export-actions">
              <button
                type="button"
                disabled={isBusy || overBudget || activeTasks.length === 0}
                onClick={() => {
                  if (!subjectId || !plan) return;
                  try {
                    const portable = normalizeStudySession(plan);
                    if (!rememberStudyDraft(scope, portable)) {
                      throw new Error("STUDY_SESSION_DRAFT_UNAVAILABLE");
                    }
                    navigate(
                      "/study/run?subjectId=" + encodeURIComponent(subjectId),
                    );
                  } catch (error) {
                    setFeedback({ scope, error: true, text: apiError(error) });
                  }
                }}
              >
                Realizar esta sesión
              </button>
              <button
                type="button"
                disabled={isBusy || overBudget}
                onClick={() => void exportFile("json")}
              >
                Exportar plan JSON
              </button>
              <button
                type="button"
                disabled={isBusy || overBudget || activeTasks.length === 0}
                onClick={() => void exportFile("markdown")}
              >
                Exportar lista Markdown
              </button>
              <button
                type="button"
                disabled={
                  isBusy ||
                  overBudget ||
                  activeTasks.length === 0 ||
                  !plan.startsAt
                }
                onClick={() => void exportFile("calendar")}
              >
                Agregar a calendario (.ics)
              </button>
              <button
                type="button"
                disabled={isBusy || activeTasks.length === 0}
                onClick={() => void checkAccess()}
              >
                Revalidar accesos
              </button>
              <label className="study-session-import">
                Importar un plan JSON
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={isBusy}
                  onChange={onFileChange}
                  aria-label="Importar sesión desde un archivo JSON"
                />
              </label>
            </div>
            {isBusy && <p role="status">{busy.text}</p>}
            {currentFeedback && (
              <p
                role={currentFeedback.error ? "alert" : "status"}
                className={
                  currentFeedback.error
                    ? "study-session-alert"
                    : "study-session-feedback"
                }
              >
                {currentFeedback.text}
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
