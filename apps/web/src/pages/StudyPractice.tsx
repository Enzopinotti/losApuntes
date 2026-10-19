import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  AnswerView,
  QuestionDetailResponse,
  QuestionView,
} from "../features/community/interfaces";
import {
  communityApi,
  isCommunityApiError,
} from "../features/community/services/communityService";
import type { ContextualDiscoveryResponse } from "../features/search/interfaces";
import {
  isSearchApiError,
  searchApi,
} from "../features/search/services/searchService";
import {
  ACTIVE_RECALL_MAX_QUESTIONS,
  nextRecallOutcomes,
  normalizeRecallQueue,
  recallSummary,
  recallToStudySession,
  retryRecallQueue,
  type RecallOutcomes,
} from "../features/study/study-active-recall.mjs";
import { serializeStudySession } from "../features/study/study-session-plan.mjs";
import { buildPrivateRecallReport } from "../features/study/study-recall-private-report.mjs";
import {
  nextRecallFocus,
  type RecallFocusCategory,
} from "../features/study/study-recall-focus.mjs";
import {
  RECALL_REVIEW_DURATIONS,
  organizeRecallSession,
  recordRecallAttempt,
  type RecallAttemptSnapshot,
} from "../features/study/study-recall-planning.mjs";
import { createStudyHandoff } from "../features/study/study-session-handoff.mjs";
import {
  forgetRecallPause,
  inspectRecallPause,
  pauseRecallRound,
  takeRecallPause,
} from "../features/study/study-recall-pause.mjs";
import {
  isPracticeQuestionForSubject,
  practiceQuestionFromParams,
} from "../features/study/study-practice-question-link.mjs";
import {
  resolveStudySubject,
  studySubjectHref,
  studySubjectSelectionFromParams,
} from "../features/study/study-subject-navigation.mjs";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./StudyPractice.scss";

type ContextState = {
  scope: string;
  loading: boolean;
  data: ContextualDiscoveryResponse | null;
  error: string | null;
};
type QuestionList = {
  scope: string;
  loading: boolean;
  items: QuestionView[];
  nextCursor: string | null;
  error: string | null;
};
type Round = {
  scope: string;
  pass: number;
  history: RecallAttemptSnapshot[];
  ids: string[];
  position: number;
  revealedIds: string[];
  outcomes: RecallOutcomes;
  reflections: Record<string, string>;
};
type QuestionDetail = {
  key: string;
  loading: boolean;
  loadingMore: boolean;
  question: QuestionDetailResponse["question"] | null;
  answers: AnswerView[];
  nextCursor: string | null;
  error: string | null;
};
type Feedback = {
  scope: string;
  message: string;
  error: boolean;
};

function messageFor(error: unknown): string {
  if (isSearchApiError(error) || isCommunityApiError(error)) {
    if (error.status === 401) return "Tu sesión ya no está activa.";
    if (error.status === 403 || error.status === 404) {
      return "Esta pregunta ya no está disponible.";
    }
    return error.message;
  }
  return "No pudimos completar la consulta. Podés reintentar.";
}

function addUnique<T extends { id: string }>(first: T[], second: T[]): T[] {
  return Array.from(
    new Map([...first, ...second].map((item) => [item.id, item])).values(),
  );
}

function downloadReviewPlan(contents: string): void {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "los-apuntes-preguntas-para-repasar.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadPrivateRecallSummary(contents: string): void {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "text/markdown;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "los-apuntes-mi-resumen-de-practica.md";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StudyPractice() {
  const { status, user, session } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const selection = studySubjectSelectionFromParams(params);
  const questionSelection = practiceQuestionFromParams(params);
  const focusId =
    questionSelection.kind === "selected" ? questionSelection.questionId : null;
  const authScope = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "none",
  ].join(":");

  const [contextState, setContextState] = useState<ContextState | null>(null);
  const context = contextState?.scope === authScope ? contextState : null;
  const resolution = context?.data
    ? resolveStudySubject(selection, context.data.subjects)
    : null;
  const subject = resolution?.kind === "ready" ? resolution.subject : null;
  const subjectId = subject?.id ?? null;
  const scope = `${authScope}:${subjectId ?? "none"}:${focusId ?? questionSelection.kind}`;

  const [focusedState, setFocusedState] = useState<{
    key: string;
    loading: boolean;
    question: QuestionView | null;
    error: string | null;
  } | null>(null);
  const focusedKey = `${scope}:focused-question`;
  const focused = focusedState?.key === focusedKey ? focusedState : null;
  const [listState, setListState] = useState<QuestionList | null>(null);
  const list = listState?.scope === scope ? listState : null;
  const [selectionState, setSelectionState] = useState<{
    scope: string;
    ids: string[];
  } | null>(null);
  const chosen = selectionState?.scope === scope ? selectionState.ids : [];
  const [reviewSettings, setReviewSettings] = useState<{
    scope: string;
    startsAt: string;
    minutes: number;
  } | null>(null);
  const review =
    reviewSettings?.scope === scope
      ? reviewSettings
      : { scope, startsAt: "", minutes: 20 };
  const [roundState, setRoundState] = useState<Round | null>(null);
  const [activationId, setActivationId] = useState(0);
  const round = roundState?.scope === scope ? roundState : null;
  const paused =
    !round &&
    status === "authenticated" &&
    subjectId &&
    questionSelection.kind !== "invalid"
      ? inspectRecallPause(scope, subjectId)
      : null;
  const currentId = round?.ids[round.position] ?? null;
  const detailKey = `${scope}:attempt-${round?.pass ?? 0}:activation-${activationId}:${currentId ?? "none"}`;
  const [detailState, setDetailState] = useState<QuestionDetail | null>(null);
  const detail = detailState?.key === detailKey ? detailState : null;
  const revealed = Boolean(currentId && round?.revealedIds.includes(currentId));
  const summary = round ? recallSummary(round.ids, round.outcomes) : null;
  const nextPendingPosition =
    round && subjectId
      ? nextRecallFocus(subjectId, round.ids, round.position, round.outcomes, "pending")
      : null;
  const nextReviewPosition =
    round && subjectId
      ? nextRecallFocus(subjectId, round.ids, round.position, round.outcomes, "review")
      : null;
  const [feedbackState, setFeedbackState] = useState<Feedback | null>(null);
  const feedback = feedbackState?.scope === scope ? feedbackState : null;
  const [revealState, setRevealState] = useState<{
    key: string;
    busy: boolean;
    error: string | null;
  } | null>(null);
  const revealStatus = revealState?.key === detailKey ? revealState : null;

  const {
    begin: beginContext,
    isCurrent: contextCurrent,
    finish: finishContext,
  } = useAsyncAuthorityFence(`practice-context:${authScope}`);
  const {
    begin: beginList,
    isCurrent: listCurrent,
    finish: finishList,
  } = useAsyncAuthorityFence(`practice-list:${scope}`);
  const {
    begin: beginFocused,
    isCurrent: focusedCurrent,
    finish: finishFocused,
  } = useAsyncAuthorityFence(`practice-focus:${focusedKey}`);
  const {
    begin: beginDetail,
    isCurrent: detailCurrent,
    finish: finishDetail,
  } = useAsyncAuthorityFence(`practice-detail:${detailKey}`);
  const {
    begin: beginMore,
    isCurrent: moreCurrent,
    finish: finishMore,
  } = useAsyncAuthorityFence(`practice-more:${detailKey}`);
  const {
    begin: beginReveal,
    isCurrent: revealCurrent,
    finish: finishReveal,
  } = useAsyncAuthorityFence(`practice-reveal:${detailKey}`);

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
      const result = await searchApi.contextual(
        { subjectLimit: 8, resourcesPerSubject: 1 },
        ticket.signal,
      );
      if (contextCurrent(ticket)) {
        setContextState({
          scope: authScope,
          loading: false,
          data: result,
          error: null,
        });
      }
    } catch (error) {
      if (contextCurrent(ticket)) {
        setContextState({
          scope: authScope,
          loading: false,
          data: null,
          error: messageFor(error),
        });
      }
    } finally {
      finishContext(ticket);
    }
  }, [status, authScope, beginContext, contextCurrent, finishContext]);

  const loadQuestions = useCallback(
    async (cursor?: string) => {
      if (!subjectId || questionSelection.kind === "invalid") return;
      const ticket = beginList();
      if (!listCurrent(ticket)) return;
      setListState((previous) => ({
        scope,
        loading: true,
        items: cursor && previous?.scope === scope ? previous.items : [],
        nextCursor: null,
        error: null,
      }));
      try {
        const response = await communityApi.questions(
          { subjectId, limit: 25, cursor },
          ticket.signal,
        );
        if (listCurrent(ticket)) {
          setListState((previous) => ({
            scope,
            loading: false,
            items:
              cursor && previous?.scope === scope
                ? addUnique(previous.items, response.items)
                : response.items,
            nextCursor: response.nextCursor,
            error: null,
          }));
        }
      } catch (error) {
        if (listCurrent(ticket)) {
          setListState((previous) => ({
            scope,
            loading: false,
            items: cursor && previous?.scope === scope ? previous.items : [],
            nextCursor: null,
            error: messageFor(error),
          }));
        }
      } finally {
        finishList(ticket);
      }
    },
    [
      subjectId,
      scope,
      questionSelection.kind,
      beginList,
      listCurrent,
      finishList,
    ],
  );

  const loadDetail = useCallback(async () => {
    if (!currentId || !subjectId) return;
    const ticket = beginDetail();
    if (!detailCurrent(ticket)) return;
    setDetailState({
      key: detailKey,
      loading: true,
      loadingMore: false,
      question: null,
      answers: [],
      nextCursor: null,
      error: null,
    });
    try {
      const response = await communityApi.question(currentId, ticket.signal);
      if (response.question.academic.subject.id !== subjectId) {
        throw new Error("Question subject changed");
      }
      if (detailCurrent(ticket)) {
        setDetailState({
          key: detailKey,
          loading: false,
          loadingMore: false,
          question: response.question,
          answers: response.answers,
          nextCursor: response.answersNextCursor,
          error: null,
        });
      }
    } catch (error) {
      if (detailCurrent(ticket)) {
        setDetailState({
          key: detailKey,
          loading: false,
          loadingMore: false,
          question: null,
          answers: [],
          nextCursor: null,
          error: messageFor(error),
        });
      }
    } finally {
      finishDetail(ticket);
    }
  }, [
    currentId,
    subjectId,
    detailKey,
    beginDetail,
    detailCurrent,
    finishDetail,
  ]);

  const revealAnswers = async () => {
    if (!currentId || !subjectId || !detail?.question || revealStatus?.busy) {
      return;
    }
    const ticket = beginReveal();
    if (!revealCurrent(ticket)) return;
    setRevealState({ key: detailKey, busy: true, error: null });
    try {
      // Refresh at the actual reveal boundary. An older response may have
      // been removed while the student was preparing their own explanation.
      const response = await communityApi.question(currentId, ticket.signal);
      if (response.question.academic.subject.id !== subjectId) {
        throw new Error("Question subject changed");
      }
      if (!revealCurrent(ticket)) return;
      setDetailState({
        key: detailKey,
        loading: false,
        loadingMore: false,
        question: response.question,
        answers: response.answers,
        nextCursor: response.answersNextCursor,
        error: null,
      });
      changeRound((previous) => ({
        ...previous,
        revealedIds: [...new Set([...previous.revealedIds, currentId])],
      }));
      setRevealState({ key: detailKey, busy: false, error: null });
    } catch (error) {
      if (revealCurrent(ticket)) {
        setRevealState({
          key: detailKey,
          busy: false,
          error: messageFor(error),
        });
      }
    } finally {
      finishReveal(ticket);
    }
  };

  const loadMoreAnswers = async () => {
    if (
      !currentId ||
      !detail?.question ||
      !detail.nextCursor ||
      detail.loadingMore
    )
      return;
    const cursor = detail.nextCursor;
    const ticket = beginMore();
    if (!moreCurrent(ticket)) return;
    setDetailState((previous) =>
      previous?.key === detailKey
        ? { ...previous, loadingMore: true, error: null }
        : previous,
    );
    try {
      const response = await communityApi.answers(
        currentId,
        cursor,
        25,
        ticket.signal,
      );
      if (moreCurrent(ticket)) {
        setDetailState((previous) =>
          previous?.key === detailKey
            ? {
                ...previous,
                answers: addUnique(previous.answers, response.items),
                nextCursor: response.nextCursor,
                loadingMore: false,
              }
            : previous,
        );
      }
    } catch (error) {
      if (moreCurrent(ticket)) {
        setDetailState((previous) =>
          previous?.key === detailKey
            ? { ...previous, loadingMore: false, error: messageFor(error) }
            : previous,
        );
      }
    } finally {
      finishMore(ticket);
    }
  };

  const loadFocusedQuestion = useCallback(async () => {
    if (status !== "authenticated" || !subjectId || !focusId) return;
    const ticket = beginFocused();
    if (!focusedCurrent(ticket)) return;
    setFocusedState({
      key: focusedKey,
      loading: true,
      question: null,
      error: null,
    });
    try {
      const response = await communityApi.question(focusId, ticket.signal);
      if (!focusedCurrent(ticket)) return;
      if (
        !isPracticeQuestionForSubject(response.question, subjectId, focusId)
      ) {
        setFocusedState({
          key: focusedKey,
          loading: false,
          question: null,
          error:
            "La pregunta no pertenece a esta materia o ya no está disponible.",
        });
        return;
      }
      setFocusedState({
        key: focusedKey,
        loading: false,
        question: response.question,
        error: null,
      });
    } catch (error) {
      if (focusedCurrent(ticket)) {
        setFocusedState({
          key: focusedKey,
          loading: false,
          question: null,
          error: messageFor(error),
        });
      }
    } finally {
      finishFocused(ticket);
    }
  }, [
    status,
    subjectId,
    focusId,
    focusedKey,
    beginFocused,
    focusedCurrent,
    finishFocused,
  ]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (subjectId && questionSelection.kind !== "invalid") {
      void loadQuestions();
    }
  }, [subjectId, questionSelection.kind, loadQuestions]);

  useEffect(() => {
    if (status === "authenticated" && subjectId && focusId) {
      void loadFocusedQuestion();
    }
  }, [status, subjectId, focusId, loadFocusedQuestion]);

  useEffect(() => {
    if (currentId) void loadDetail();
  }, [currentId, loadDetail]);

  const toggleChoice = (id: string) => {
    if (!subjectId || round) return;
    setSelectionState((previous) => {
      const items = previous?.scope === scope ? previous.ids : [];
      if (items.includes(id)) {
        return { scope, ids: items.filter((item) => item !== id) };
      }
      if (items.length >= ACTIVE_RECALL_MAX_QUESTIONS)
        return { scope, ids: items };
      return { scope, ids: [...items, id] };
    });
  };

  const startRound = (ids: string[]) => {
    if (!subjectId || ids.length === 0) return;
    try {
      const queue = normalizeRecallQueue(subjectId, ids);
      forgetRecallPause(scope, subjectId);
      setActivationId((value) => value + 1);
      setRoundState({
        scope,
        pass: 1,
        history: [],
        ids: queue,
        position: 0,
        revealedIds: [],
        outcomes: {},
        reflections: {},
      });
      setFeedbackState(null);
    } catch {
      setFeedbackState({
        scope,
        error: true,
        message: "La selección tiene preguntas inválidas.",
      });
    }
  };

  const changeRound = (update: (value: Round) => Round) => {
    setRoundState((previous) =>
      previous?.scope === scope ? update(previous) : previous,
    );
  };

  const jumpToRecallCategory = (category: RecallFocusCategory) => {
    if (!round || !subjectId) return;
    try {
      const next = nextRecallFocus(
        subjectId,
        round.ids,
        round.position,
        round.outcomes,
        category,
      );
      if (next === null) return;
      changeRound((previous) =>
        previous.pass === round.pass && previous.position === round.position
          ? { ...previous, position: next }
          : previous,
      );
    } catch {
      setFeedbackState({
        scope,
        error: true,
        message: "No pudimos ubicar esa pregunta. Elegí una de la lista.",
      });
    }
  };

  const markOutcome = (outcome: "understood" | "review") => {
    if (!round || !currentId || !revealed || !detail?.question) return;
    changeRound((previous) => ({
      ...previous,
      outcomes: nextRecallOutcomes(
        previous.ids,
        previous.outcomes,
        currentId,
        outcome,
      ),
    }));
  };

  const exportPending = () => {
    if (!subjectId || !round || !summary?.review) return;
    try {
      const plan = recallToStudySession(subjectId, round.ids, round.outcomes);
      if (!plan) return;
      const organized = organizeRecallSession(
        plan,
        review.startsAt,
        review.minutes,
      );
      downloadReviewPlan(serializeStudySession(organized));
      setFeedbackState({
        scope,
        error: false,
        message:
          "Se preparó un plan JSON con las preguntas pendientes. Importalo desde Preparar una sesión.",
      });
    } catch {
      setFeedbackState({
        scope,
        error: true,
        message:
          "No pudimos generar el archivo. Revisá la fecha: debe ser futura y dentro de los próximos 180 días.",
      });
    }
  };

  const openPendingInPlanner = () => {
    if (
      !subjectId ||
      !round ||
      !summary?.review ||
      status !== "authenticated"
    ) {
      return;
    }
    // Navigating away necessarily discards memory-only practice reflections.
    if (
      Object.values(round.reflections).some(
        (value) => value.trim().length > 0,
      ) &&
      !window.confirm(
        "Los intentos escritos son temporales y se perderán al salir. ¿Pasar las preguntas para repasar al Planificador?",
      )
    )
      return;
    try {
      const plan = recallToStudySession(subjectId, round.ids, round.outcomes);
      if (!plan) return;
      const organized = organizeRecallSession(
        plan,
        review.startsAt,
        review.minutes,
      );
      const handoff = createStudyHandoff(organized, scope);
      navigate(`/study/session?subjectId=${encodeURIComponent(subjectId)}`, {
        state: handoff,
      });
    } catch {
      setFeedbackState({
        scope,
        error: true,
        message:
          "No pudimos preparar el repaso. Revisá la fecha elegida o descargá el JSON.",
      });
    }
  };

  const downloadPrivateSummary = () => {
    if (!round || !summary || status !== "authenticated") return;
    try {
      const report = buildPrivateRecallReport({
        history: round.history,
        current: {
          pass: round.pass,
          total: summary.total,
          understood: summary.understood,
          review: summary.review,
          pending: summary.pending,
        },
        minutes: review.minutes,
      });
      downloadPrivateRecallSummary(report);
      setFeedbackState({
        scope,
        error: false,
        message: "Se descargó tu resumen personal sin preguntas ni respuestas.",
      });
    } catch {
      setFeedbackState({
        scope,
        error: true,
        message: "No pudimos preparar el resumen de esta práctica.",
      });
    }
  };

  const retryMarkedQuestions = () => {
    if (
      !round ||
      !subjectId ||
      status !== "authenticated" ||
      !summary?.review
    ) {
      return;
    }
    if (
      !window.confirm(
        "¿Reintentar las preguntas marcadas para repasar? Se borrarán las respuestas escritas y marcas temporales de esta ronda.",
      )
    ) {
      return;
    }
    try {
      const ids = retryRecallQueue(subjectId, round.ids, round.outcomes);
      if (!ids) return;
      const history = recordRecallAttempt(
        subjectId,
        round.history,
        round.pass,
        round.ids,
        round.outcomes,
      );
      setRoundState((previous) =>
        previous?.scope === scope && previous.pass === round.pass
          ? {
              scope,
              pass: previous.pass + 1,
              history,
              ids,
              position: 0,
              revealedIds: [],
              outcomes: {},
              reflections: {},
            }
          : previous,
      );
      setFeedbackState(null);
    } catch {
      setFeedbackState({
        scope,
        error: true,
        message:
          "No pudimos preparar el nuevo intento. Salí de la ronda y elegí las preguntas nuevamente.",
      });
    }
  };

  const pauseRound = () => {
    if (!round || !subjectId || status !== "authenticated") return;
    if (
      !window.confirm(
        "¿Pausar esta ronda por diez minutos? Guardaremos solo las preguntas, tu posición y tus marcas. Se descartarán los intentos escritos y las respuestas mostradas.",
      )
    )
      return;
    try {
      pauseRecallRound(scope, subjectId, {
        ids: round.ids,
        position: round.position,
        pass: round.pass,
        history: round.history,
        outcomes: round.outcomes,
        startsAt: review.startsAt,
        minutes: review.minutes,
      });
      setRoundState(null);
      setFeedbackState({
        scope,
        error: false,
        message:
          "Ronda pausada en esta pestaña. Podés volver a la Mesa y continuar dentro de diez minutos, sin conservar respuestas escritas.",
      });
    } catch {
      setFeedbackState({
        scope,
        error: true,
        message:
          "No pudimos pausar esta ronda. El intento actual sigue abierto.",
      });
    }
  };

  const resumeRound = () => {
    if (round || !subjectId || status !== "authenticated") return;
    const saved = takeRecallPause(scope, subjectId);
    if (!saved) {
      setFeedbackState({
        scope,
        error: true,
        message:
          "La pausa venció o ya fue utilizada. Elegí las preguntas otra vez.",
      });
      return;
    }
    setActivationId((value) => value + 1);
    setReviewSettings({
      scope,
      startsAt: saved.startsAt,
      minutes: saved.minutes,
    });
    setRoundState({
      scope,
      pass: saved.pass,
      history: saved.history,
      ids: saved.ids,
      position: saved.position,
      outcomes: saved.outcomes,
      revealedIds: [],
      reflections: {},
    });
    setFeedbackState({
      scope,
      error: false,
      message:
        "Ronda retomada. La pregunta se consulta de nuevo y sus respuestas permanecen ocultas.",
    });
  };

  const discardPause = () => {
    if (
      !subjectId ||
      !paused ||
      !window.confirm(
        "¿Descartar esta pausa? Se perderán las marcas y la posición guardadas.",
      )
    )
      return;
    if (forgetRecallPause(scope, subjectId)) {
      setFeedbackState({ scope, error: false, message: "Pausa descartada." });
    }
  };

  const resetRound = () => {
    if (!round) return;
    if (
      !window.confirm(
        "¿Salir de la ronda? Las notas y marcas temporales se perderán.",
      )
    ) {
      return;
    }
    setRoundState(null);
    setFeedbackState(null);
  };

  const question = detail?.question ?? null;
  const shownAnswers = revealed ? (detail?.answers ?? []) : [];
  const acceptedNotLoaded = Boolean(
    revealed &&
    question?.acceptedAnswerId &&
    !shownAnswers.some((answer) => answer.id === question.acceptedAnswerId),
  );

  return (
    <section className="study-practice" aria-labelledby="study-practice-title">
      <header className="study-practice-header">
        <div>
          <p className="study-practice-kicker">Estudio activo</p>
          <h1 id="study-practice-title">Practicar preguntas</h1>
          <p>
            Intentá responder antes de comparar con la comunidad. La evaluación
            es tuya: una respuesta aceptada por su autor no es una corrección
            oficial.
          </p>
        </div>
        <Link
          to={subjectId ? (studySubjectHref(subjectId) ?? "/study") : "/study"}
        >
          Volver a Mesa de estudio
        </Link>
      </header>

      {status !== "authenticated" || !context || context.loading ? (
        <p role="status">Preparando tu contexto académico…</p>
      ) : context.error ? (
        <div className="study-practice-error" role="alert">
          <p>{context.error}</p>
          <button type="button" onClick={() => void loadContext()}>
            Reintentar
          </button>
        </div>
      ) : !subject || resolution?.kind !== "ready" ? (
        <div className="study-practice-empty">
          <h2>Elegí una materia actual</h2>
          <p>
            Solo se admiten identificadores válidos dentro de las primeras ocho
            materias del contexto. La selección no concede acceso a contenido.
          </p>
          <Link to="/study">Elegir materia</Link>
        </div>
      ) : (
        <>
          <div className="study-practice-subject">
            <strong>{subject.name}</strong>
            <span>Sin notas persistidas ni calificaciones públicas.</span>
          </div>
          {!round && questionSelection.kind === "invalid" ? (
            <section
              className="study-practice-panel"
              aria-labelledby="study-practice-invalid-link"
            >
              <h2 id="study-practice-invalid-link">
                Enlace de práctica inválido
              </h2>
              <p role="alert">
                El identificador de pregunta es inválido o está repetido. No
                abrimos otra pregunta ni iniciamos una práctica general.
              </p>
              <Link
                to={`/study/practice?subjectId=${encodeURIComponent(subject.id)}`}
              >
                Elegir preguntas de esta materia
              </Link>
            </section>
          ) : !round ? (
            <>
              {paused && (
                <section
                  className="study-practice-panel study-practice-paused"
                  aria-labelledby="study-practice-paused-title"
                >
                  <h2 id="study-practice-paused-title">
                    Continuar ronda pausada
                  </h2>
                  <p>
                    Intento {paused.checkpoint.pass} · Pregunta{" "}
                    {paused.checkpoint.position + 1} de{" "}
                    {paused.checkpoint.ids.length}. Conservamos solamente tus
                    marcas, el orden y el horario elegido durante diez minutos
                    en esta pestaña.
                  </p>
                  <p>
                    Al continuar, volveremos a consultar la pregunta. Las
                    respuestas y los intentos escritos no se recuperan.
                  </p>
                  <div className="study-practice-actions">
                    <button type="button" onClick={resumeRound}>
                      Continuar ronda pausada
                    </button>
                    <button type="button" onClick={discardPause}>
                      Descartar pausa
                    </button>
                  </div>
                </section>
              )}
              {focusId && (
                <section
                  className="study-practice-panel study-practice-focused"
                  aria-labelledby="study-practice-focused-title"
                >
                  <h2 id="study-practice-focused-title">
                    Practicar esta pregunta
                  </h2>
                  {focused?.loading || !focused ? (
                    <p role="status">Verificando la pregunta y su materia…</p>
                  ) : focused.error ? (
                    <div role="alert" className="study-practice-error">
                      <p>{focused.error}</p>
                      <div className="study-practice-actions">
                        <button
                          type="button"
                          onClick={() => void loadFocusedQuestion()}
                        >
                          Reintentar verificación
                        </button>
                        <Link
                          to={`/study/practice?subjectId=${encodeURIComponent(subject.id)}`}
                        >
                          Elegir otra pregunta
                        </Link>
                      </div>
                    </div>
                  ) : focused.question ? (
                    <>
                      <h3>{focused.question.title}</h3>
                      <p className="study-practice-body">
                        {focused.question.body}
                      </p>
                      <p>
                        Las respuestas se mantienen ocultas hasta que intentes
                        resolverla y elijas revelarlas.
                      </p>
                      <div className="study-practice-actions">
                        <button
                          type="button"
                          onClick={() => startRound([focused.question!.id])}
                        >
                          Empezar práctica enfocada
                        </button>
                        <Link
                          to={`/questions?id=${encodeURIComponent(focused.question.id)}`}
                        >
                          Ver conversación original
                        </Link>
                        <Link
                          to={`/study/practice?subjectId=${encodeURIComponent(subject.id)}`}
                        >
                          Quitar foco y elegir preguntas
                        </Link>
                      </div>
                    </>
                  ) : null}
                </section>
              )}
              <section
                className="study-practice-panel"
                aria-labelledby="study-practice-choose"
              >
                <h2 id="study-practice-choose">
                  1. Elegí las preguntas de tu ronda
                </h2>
                <p>
                  Podés practicar hasta {ACTIVE_RECALL_MAX_QUESTIONS} preguntas.
                  La lista corresponde a las páginas cargadas, no al total de la
                  materia.
                </p>
                <div className="study-practice-actions">
                  <button
                    type="button"
                    disabled={chosen.length === 0}
                    onClick={() => startRound(chosen)}
                  >
                    Practicar {chosen.length} seleccionadas
                  </button>
                  <button
                    type="button"
                    disabled={!list?.items.length}
                    onClick={() =>
                      startRound(
                        (list?.items ?? []).slice(0, 5).map((item) => item.id),
                      )
                    }
                  >
                    Practicar las primeras 5
                  </button>
                  <button
                    type="button"
                    disabled={list?.loading}
                    onClick={() => void loadQuestions()}
                  >
                    Actualizar preguntas
                  </button>
                </div>
                {list?.error && (
                  <p className="study-practice-error" role="alert">
                    {list.error}
                  </p>
                )}
                {list?.loading && <p role="status">Consultando preguntas…</p>}
                {list &&
                  !list.loading &&
                  !list.error &&
                  list.items.length === 0 && (
                    <p>
                      No hay preguntas visibles para esta materia. Podés{" "}
                      <Link to="/questions">abrir una consulta</Link>.
                    </p>
                  )}
                <ul className="study-practice-choices">
                  {(list?.items ?? []).map((item) => {
                    const selected = chosen.includes(item.id);
                    return (
                      <li key={item.id}>
                        <div>
                          <strong>{item.title}</strong>
                          <small>
                            {item.state === "open" ? "Abierta" : "Cerrada"} ·{" "}
                            {item.answerCount} respuestas
                          </small>
                        </div>
                        <button
                          type="button"
                          aria-pressed={selected}
                          disabled={
                            !selected &&
                            chosen.length >= ACTIVE_RECALL_MAX_QUESTIONS
                          }
                          onClick={() => toggleChoice(item.id)}
                        >
                          {selected ? "Quitar" : "Elegir"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {list?.nextCursor && (
                  <button
                    type="button"
                    disabled={list.loading}
                    onClick={() =>
                      void loadQuestions(list.nextCursor ?? undefined)
                    }
                  >
                    Cargar más preguntas
                  </button>
                )}
              </section>
            </>
          ) : (
            <div className="study-practice-workspace">
              <section
                className="study-practice-panel"
                aria-labelledby="study-practice-round"
              >
                <div className="study-practice-round-top">
                  <div>
                    <h2 id="study-practice-round">2. Ronda de práctica</h2>
                    <p>
                      Intento {round.pass} · Pregunta {round.position + 1} de{" "}
                      {round.ids.length}
                    </p>
                  </div>
                  <div className="study-practice-actions">
                    <button
                      type="button"
                      className="study-practice-secondary"
                      onClick={pauseRound}
                    >
                      Pausar ronda
                    </button>
                    <button
                      type="button"
                      className="study-practice-secondary"
                      onClick={resetRound}
                    >
                      Salir de la ronda
                    </button>
                  </div>
                </div>
                {detail?.loading || !detail ? (
                  <p role="status">Cargando la pregunta vigente…</p>
                ) : detail.error && !question ? (
                  <div role="alert" className="study-practice-error">
                    <p>{detail.error}</p>
                    <button type="button" onClick={() => void loadDetail()}>
                      Reintentar
                    </button>
                    <p>Podés avanzar sin calificarla.</p>
                  </div>
                ) : question ? (
                  <>
                    <article className="study-practice-question">
                      <p className="study-practice-kicker">Tu desafío</p>
                      <h3>{question.title}</h3>
                      <p className="study-practice-body">{question.body}</p>
                      <Link
                        to={`/questions?id=${encodeURIComponent(question.id)}`}
                      >
                        Abrir conversación completa
                      </Link>
                    </article>
                    <label className="study-practice-reflection">
                      Tu intento de respuesta (solo en esta pestaña)
                      <textarea
                        rows={5}
                        maxLength={1000}
                        value={round.reflections[currentId ?? ""] ?? ""}
                        onChange={(event) => {
                          const answer = event.target.value;
                          if (!currentId) return;
                          changeRound((previous) => ({
                            ...previous,
                            reflections: {
                              ...previous.reflections,
                              [currentId]: answer,
                            },
                          }));
                        }}
                        placeholder="Escribí una explicación, cálculo o pasos antes de comparar."
                      />
                    </label>
                    {!revealed ? (
                      <>
                        <button
                          type="button"
                          disabled={revealStatus?.busy}
                          onClick={() => void revealAnswers()}
                        >
                          {revealStatus?.busy
                            ? "Comprobando respuestas…"
                            : "Mostrar respuestas de la comunidad"}
                        </button>
                        {revealStatus?.error && (
                          <p className="study-practice-error" role="alert">
                            {revealStatus.error} Las respuestas siguen ocultas.
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="study-practice-answers">
                        <h3>Compará con respuestas disponibles</h3>
                        <p>
                          Las respuestas representan aportes de usuarios; pueden
                          ser incompletas o estar equivocadas.
                        </p>
                        {shownAnswers.length === 0 && (
                          <p>
                            Esta pregunta todavía no tiene respuestas cargadas.
                          </p>
                        )}
                        <ol>
                          {shownAnswers.map((answer) => (
                            <li key={answer.id}>
                              {question.acceptedAnswerId === answer.id && (
                                <strong>
                                  Respuesta aceptada por quien preguntó
                                </strong>
                              )}
                              <p className="study-practice-body">
                                {answer.body}
                              </p>
                              <small>
                                {answer.author?.displayName ?? "Participante"}
                              </small>
                            </li>
                          ))}
                        </ol>
                        {acceptedNotLoaded && (
                          <p>
                            La respuesta aceptada, si sigue disponible, puede
                            estar en otra página.
                          </p>
                        )}
                        {detail.error && (
                          <p className="study-practice-error" role="alert">
                            {detail.error}
                          </p>
                        )}
                        {detail.nextCursor && (
                          <button
                            type="button"
                            disabled={detail.loadingMore}
                            onClick={() => void loadMoreAnswers()}
                          >
                            {detail.loadingMore
                              ? "Cargando…"
                              : "Ver más respuestas"}
                          </button>
                        )}
                        <h3>Mi revisión</h3>
                        <p>
                          Marcá cómo te sentís con el tema. No se genera una
                          nota automática.
                        </p>
                        <div className="study-practice-actions">
                          <button
                            type="button"
                            aria-pressed={
                              round.outcomes[currentId ?? ""] === "review"
                            }
                            onClick={() => markOutcome("review")}
                          >
                            Necesito repasar
                          </button>
                          <button
                            type="button"
                            aria-pressed={
                              round.outcomes[currentId ?? ""] === "understood"
                            }
                            onClick={() => markOutcome("understood")}
                          >
                            Lo pude explicar
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
                <div className="study-practice-pagination">
                  <button
                    type="button"
                    disabled={round.position === 0}
                    onClick={() =>
                      changeRound((previous) => ({
                        ...previous,
                        position: previous.position - 1,
                      }))
                    }
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={round.position >= round.ids.length - 1}
                    onClick={() =>
                      changeRound((previous) => ({
                        ...previous,
                        position: previous.position + 1,
                      }))
                    }
                  >
                    Siguiente
                  </button>
                </div>
              </section>
              <aside
                className="study-practice-panel"
                aria-labelledby="study-practice-summary"
              >
                <h2 id="study-practice-summary">Tu propio repaso</h2>
                <p>
                  Estas marcas son privadas y temporales: no son una puntuación
                  académica.
                </p>
                <div className="study-practice-stats" aria-live="polite">
                  <span>
                    <strong>{summary?.completed ?? 0}</strong> revisadas
                  </span>
                  <span>
                    <strong>{summary?.review ?? 0}</strong> para repasar
                  </span>
                  <span>
                    <strong>{summary?.understood ?? 0}</strong> explicadas
                  </span>
                  <span>
                    <strong>{summary?.pending ?? 0}</strong> sin clasificar
                  </span>
                </div>
                {round.history.length > 0 && (
                  <section
                    className="study-practice-attempt-history"
                    aria-label="Intentos anteriores de esta ronda"
                  >
                    <h3>Repasos anteriores en esta pestaña</h3>
                    <p>
                      Son recuentos de tus propias marcas, no notas ni medidas
                      de aprendizaje. Se borran al salir de la ronda.
                    </p>
                    <ol>
                      {round.history.map((attempt) => (
                        <li key={attempt.pass}>
                          Intento {attempt.pass}: {attempt.review} para repasar,{" "}
                          {attempt.understood} explicadas y {attempt.pending}{" "}
                          sin clasificar.
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                <section
                  className="study-practice-guided-navigation"
                  aria-labelledby="study-practice-guided-title"
                >
                  <h3 id="study-practice-guided-title">Recorrer lo que falta</h3>
                  <p>
                    Saltá a otra pregunta sin clasificar o marcada para
                    repasar. El recorrido da la vuelta a la lista, no
                    califica preguntas automáticamente ni borra tus notas.
                  </p>
                  <div className="study-practice-actions">
                    <button
                      type="button"
                      disabled={nextPendingPosition === null}
                      onClick={() => jumpToRecallCategory("pending")}
                    >
                      Siguiente sin clasificar
                    </button>
                    <button
                      type="button"
                      disabled={nextReviewPosition === null}
                      onClick={() => jumpToRecallCategory("review")}
                    >
                      Siguiente para repasar
                    </button>
                  </div>
                  {nextPendingPosition === null &&
                    nextReviewPosition === null && (
                      <p>
                        No hay otras preguntas pendientes de estas categorías.
                        Podés seguir revisando la actual o usar la lista.
                      </p>
                    )}
                </section>
                <ol className="study-practice-outline">
                  {round.ids.map((id, index) => (
                    <li key={id}>
                      <button
                        type="button"
                        className={
                          index === round.position
                            ? "study-practice-current"
                            : ""
                        }
                        aria-current={
                          index === round.position ? "step" : undefined
                        }
                        onClick={() =>
                          changeRound((previous) => ({
                            ...previous,
                            position: index,
                          }))
                        }
                      >
                        Pregunta {index + 1} ·{" "}
                        {round.outcomes[id] === "review"
                          ? "Repasar"
                          : round.outcomes[id] === "understood"
                            ? "Explicada"
                            : "Pendiente"}
                      </button>
                    </li>
                  ))}
                </ol>
                <section
                  className="study-practice-private-report"
                  aria-labelledby="study-practice-private-report-title"
                >
                  <h3 id="study-practice-private-report-title">
                    Guardá un resumen de tu práctica
                  </h3>
                  <p>
                    Descargá un resumen con tus propios recuentos de intentos y
                    tiempo estimado para el repaso. No incluye preguntas,
                    respuestas escritas ni datos de otras personas.
                  </p>
                  <button type="button" onClick={downloadPrivateSummary}>
                    Descargar resumen privado
                  </button>
                </section>
                <h3>Volver a practicar las pendientes</h3>
                <p>
                  Reintentá solo las preguntas marcadas «Necesito repasar». El
                  nuevo intento empieza con las respuestas ocultas y consulta
                  otra vez cada pregunta. Tus notas y marcas del intento actual
                  no se conservan.
                </p>
                <div className="study-practice-actions">
                  <button
                    type="button"
                    disabled={!summary?.review}
                    onClick={retryMarkedQuestions}
                  >
                    Reintentar {summary?.review ?? 0} para repasar
                  </button>
                </div>
                <h3>Organizá tu próximo repaso</h3>
                <p>
                  Elegí un horario opcional y los minutos por pregunta. El plan
                  incluye solo los IDs marcados para repasar; no incluye
                  respuestas ni tus notas temporales.
                </p>
                <div className="study-practice-review-settings">
                  <label>
                    Fecha y hora del próximo repaso (opcional)
                    <input
                      type="datetime-local"
                      value={review.startsAt}
                      onChange={(event) =>
                        setReviewSettings({
                          ...review,
                          startsAt: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Minutos por pregunta
                    <select
                      value={review.minutes}
                      onChange={(event) =>
                        setReviewSettings({
                          ...review,
                          minutes: Number(event.target.value),
                        })
                      }
                    >
                      {RECALL_REVIEW_DURATIONS.map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes} minutos
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p>
                  Si elegís fecha, debe ser futura y estar dentro de 180 días.
                  El horario se mantiene en tu hora local. No se envían
                  recordatorios automáticos.
                </p>
                <div className="study-practice-actions">
                  <button
                    type="button"
                    disabled={!summary?.review}
                    onClick={openPendingInPlanner}
                  >
                    Pasar pendientes al Planificador
                  </button>
                  <button
                    type="button"
                    disabled={!summary?.review}
                    onClick={exportPending}
                  >
                    Descargar plan JSON
                  </button>
                </div>
                <p>
                  El pase directo solo dura diez minutos en esta pestaña y no
                  guarda tus intentos. La descarga JSON sirve para otro
                  dispositivo.
                </p>
                <p>
                  <Link
                    to={`/study/session?subjectId=${encodeURIComponent(subject.id)}`}
                  >
                    Abrir planificador sin importar preguntas
                  </Link>
                </p>
              </aside>
            </div>
          )}
          {feedback && (
            <p
              className={
                feedback.error
                  ? "study-practice-error"
                  : "study-practice-feedback"
              }
              role={feedback.error ? "alert" : "status"}
            >
              {feedback.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
