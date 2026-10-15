import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  type RecallOutcomes,
} from "../features/study/study-active-recall.mjs";
import { serializeStudySession } from "../features/study/study-session-plan.mjs";
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

export default function StudyPractice() {
  const { status, user, session } = useAuth();
  const [params] = useSearchParams();
  const selection = studySubjectSelectionFromParams(params);
  const authScope = [status, user?.id ?? "anonymous", session?.id ?? "none"].join(":");

  const [contextState, setContextState] = useState<ContextState | null>(null);
  const context = contextState?.scope === authScope ? contextState : null;
  const resolution = context?.data
    ? resolveStudySubject(selection, context.data.subjects)
    : null;
  const subject = resolution?.kind === "ready" ? resolution.subject : null;
  const subjectId = subject?.id ?? null;
  const scope = `${authScope}:${subjectId ?? "none"}`;

  const [listState, setListState] = useState<QuestionList | null>(null);
  const list = listState?.scope === scope ? listState : null;
  const [selectionState, setSelectionState] = useState<{
    scope: string;
    ids: string[];
  } | null>(null);
  const chosen = selectionState?.scope === scope ? selectionState.ids : [];
  const [roundState, setRoundState] = useState<Round | null>(null);
  const round = roundState?.scope === scope ? roundState : null;
  const currentId = round?.ids[round.position] ?? null;
  const detailKey = `${scope}:${currentId ?? "none"}`;
  const [detailState, setDetailState] = useState<QuestionDetail | null>(null);
  const detail = detailState?.key === detailKey ? detailState : null;
  const revealed = Boolean(currentId && round?.revealedIds.includes(currentId));
  const summary = round ? recallSummary(round.ids, round.outcomes) : null;
  const [feedbackState, setFeedbackState] = useState<Feedback | null>(null);
  const feedback = feedbackState?.scope === scope ? feedbackState : null;

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
    begin: beginDetail,
    isCurrent: detailCurrent,
    finish: finishDetail,
  } = useAsyncAuthorityFence(`practice-detail:${detailKey}`);
  const {
    begin: beginMore,
    isCurrent: moreCurrent,
    finish: finishMore,
  } = useAsyncAuthorityFence(`practice-more:${detailKey}`);

  const loadContext = useCallback(async () => {
    if (status !== "authenticated") return;
    const ticket = beginContext();
    if (!contextCurrent(ticket)) return;
    setContextState({ scope: authScope, loading: true, data: null, error: null });
    try {
      const result = await searchApi.contextual(
        { subjectLimit: 8, resourcesPerSubject: 1 },
        ticket.signal,
      );
      if (contextCurrent(ticket)) {
        setContextState({
          scope: authScope, loading: false, data: result, error: null,
        });
      }
    } catch (error) {
      if (contextCurrent(ticket)) {
        setContextState({
          scope: authScope, loading: false, data: null,
          error: messageFor(error),
        });
      }
    } finally {
      finishContext(ticket);
    }
  }, [status, authScope, beginContext, contextCurrent, finishContext]);

  const loadQuestions = useCallback(async (cursor?: string) => {
    if (!subjectId) return;
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
          items: cursor && previous?.scope === scope
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
  }, [subjectId, scope, beginList, listCurrent, finishList]);

  const loadDetail = useCallback(async () => {
    if (!currentId || !subjectId) return;
    const ticket = beginDetail();
    if (!detailCurrent(ticket)) return;
    setDetailState({
      key: detailKey,
      loading: true, loadingMore: false, question: null, answers: [],
      nextCursor: null, error: null,
    });
    try {
      const response = await communityApi.question(currentId, ticket.signal);
      if (response.question.academic.subject.id !== subjectId) {
        throw new Error("Question subject changed");
      }
      if (detailCurrent(ticket)) {
        setDetailState({
          key: detailKey,
          loading: false, loadingMore: false,
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
          loading: false, loadingMore: false, question: null,
          answers: [], nextCursor: null, error: messageFor(error),
        });
      }
    } finally {
      finishDetail(ticket);
    }
  }, [currentId, subjectId, detailKey, beginDetail, detailCurrent, finishDetail]);

  const loadMoreAnswers = async () => {
    if (
      !currentId || !detail?.question || !detail.nextCursor ||
      detail.loadingMore
    ) return;
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
        currentId, cursor, 25, ticket.signal,
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

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (subjectId) void loadQuestions();
  }, [subjectId, loadQuestions]);

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
      if (items.length >= ACTIVE_RECALL_MAX_QUESTIONS) return { scope, ids: items };
      return { scope, ids: [...items, id] };
    });
  };

  const startRound = (ids: string[]) => {
    if (!subjectId || ids.length === 0) return;
    try {
      const queue = normalizeRecallQueue(subjectId, ids);
      setRoundState({
        scope,
        ids: queue,
        position: 0,
        revealedIds: [],
        outcomes: {},
        reflections: {},
      });
      setFeedbackState(null);
    } catch {
      setFeedbackState({
        scope, error: true, message: "La selección tiene preguntas inválidas.",
      });
    }
  };

  const changeRound = (update: (value: Round) => Round) => {
    setRoundState((previous) =>
      previous?.scope === scope ? update(previous) : previous,
    );
  };

  const markOutcome = (outcome: "understood" | "review") => {
    if (!round || !currentId || !revealed || !detail?.question) return;
    changeRound((previous) => ({
      ...previous,
      outcomes: nextRecallOutcomes(
        previous.ids, previous.outcomes, currentId, outcome,
      ),
    }));
  };

  const exportPending = () => {
    if (!subjectId || !round || !summary?.review) return;
    try {
      const plan = recallToStudySession(
        subjectId, round.ids, round.outcomes,
      );
      if (!plan) return;
      downloadReviewPlan(serializeStudySession(plan));
      setFeedbackState({
        scope, error: false,
        message: "Se preparó un plan JSON con las preguntas pendientes. Importalo desde Preparar una sesión.",
      });
    } catch {
      setFeedbackState({
        scope, error: true, message: "No pudimos generar el archivo.",
      });
    }
  };

  const resetRound = () => {
    if (!round) return;
    if (!window.confirm("¿Salir de la ronda? Las notas y marcas temporales se perderán.")) {
      return;
    }
    setRoundState(null);
    setFeedbackState(null);
  };

  const question = detail?.question ?? null;
  const shownAnswers = revealed ? detail?.answers ?? [] : [];
  const acceptedNotLoaded = Boolean(
    revealed && question?.acceptedAnswerId &&
    !shownAnswers.some((answer) => answer.id === question.acceptedAnswerId),
  );

  return (
    <section className="study-practice" aria-labelledby="study-practice-title">
      <header className="study-practice-header">
        <div>
          <p className="study-practice-kicker">Estudio activo</p>
          <h1 id="study-practice-title">Practicar preguntas</h1>
          <p>Intentá responder antes de comparar con la comunidad. La evaluación es tuya: una respuesta aceptada por su autor no es una corrección oficial.</p>
        </div>
        <Link to={subjectId ? studySubjectHref(subjectId) ?? "/study" : "/study"}>
          Volver a Mesa de estudio
        </Link>
      </header>

      {status !== "authenticated" || !context || context.loading ? (
        <p role="status">Preparando tu contexto académico…</p>
      ) : context.error ? (
        <div className="study-practice-error" role="alert">
          <p>{context.error}</p>
          <button type="button" onClick={() => void loadContext()}>Reintentar</button>
        </div>
      ) : !subject || resolution?.kind !== "ready" ? (
        <div className="study-practice-empty">
          <h2>Elegí una materia actual</h2>
          <p>Solo se admiten identificadores válidos dentro de las primeras ocho materias del contexto. La selección no concede acceso a contenido.</p>
          <Link to="/study">Elegir materia</Link>
        </div>
      ) : (
        <>
          <div className="study-practice-subject">
            <strong>{subject.name}</strong>
            <span>Sin notas persistidas ni calificaciones públicas.</span>
          </div>
          {!round ? (
            <section className="study-practice-panel" aria-labelledby="study-practice-choose">
              <h2 id="study-practice-choose">1. Elegí las preguntas de tu ronda</h2>
              <p>Podés practicar hasta {ACTIVE_RECALL_MAX_QUESTIONS} preguntas. La lista corresponde a las páginas cargadas, no al total de la materia.</p>
              <div className="study-practice-actions">
                <button type="button" disabled={chosen.length === 0} onClick={() => startRound(chosen)}>
                  Practicar {chosen.length} seleccionadas
                </button>
                <button type="button" disabled={!list?.items.length} onClick={() => startRound(
                  (list?.items ?? []).slice(0, 5).map((item) => item.id),
                )}>
                  Practicar las primeras 5
                </button>
                <button type="button" disabled={list?.loading} onClick={() => void loadQuestions()}>
                  Actualizar preguntas
                </button>
              </div>
              {list?.error && <p className="study-practice-error" role="alert">{list.error}</p>}
              {list?.loading && <p role="status">Consultando preguntas…</p>}
              {list && !list.loading && !list.error && list.items.length === 0 && (
                <p>No hay preguntas visibles para esta materia. Podés <Link to="/questions">abrir una consulta</Link>.</p>
              )}
              <ul className="study-practice-choices">
                {(list?.items ?? []).map((item) => {
                  const selected = chosen.includes(item.id);
                  return (
                    <li key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.state === "open" ? "Abierta" : "Cerrada"} · {item.answerCount} respuestas</small>
                      </div>
                      <button
                        type="button"
                        aria-pressed={selected}
                        disabled={!selected && chosen.length >= ACTIVE_RECALL_MAX_QUESTIONS}
                        onClick={() => toggleChoice(item.id)}
                      >
                        {selected ? "Quitar" : "Elegir"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {list?.nextCursor && (
                <button type="button" disabled={list.loading} onClick={() => void loadQuestions(list.nextCursor ?? undefined)}>
                  Cargar más preguntas
                </button>
              )}
            </section>
          ) : (
            <div className="study-practice-workspace">
              <section className="study-practice-panel" aria-labelledby="study-practice-round">
                <div className="study-practice-round-top">
                  <div>
                    <h2 id="study-practice-round">
                      2. Ronda de práctica
                    </h2>
                    <p>Pregunta {round.position + 1} de {round.ids.length}</p>
                  </div>
                  <button type="button" className="study-practice-secondary" onClick={resetRound}>
                    Salir de la ronda
                  </button>
                </div>
                {detail?.loading || !detail ? (
                  <p role="status">Cargando la pregunta vigente…</p>
                ) : detail.error && !question ? (
                  <div role="alert" className="study-practice-error">
                    <p>{detail.error}</p>
                    <button type="button" onClick={() => void loadDetail()}>Reintentar</button>
                    <p>Podés avanzar sin calificarla.</p>
                  </div>
                ) : question ? (
                  <>
                    <article className="study-practice-question">
                      <p className="study-practice-kicker">Tu desafío</p>
                      <h3>{question.title}</h3>
                      <p className="study-practice-body">{question.body}</p>
                      <Link to={`/questions?id=${encodeURIComponent(question.id)}`}>Abrir conversación completa</Link>
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
                            reflections: { ...previous.reflections, [currentId]: answer },
                          }));
                        }}
                        placeholder="Escribí una explicación, cálculo o pasos antes de comparar."
                      />
                    </label>
                    {!revealed ? (
                      <button type="button" onClick={() => {
                        if (!currentId) return;
                        changeRound((previous) => ({
                          ...previous,
                          revealedIds: [...new Set([...previous.revealedIds, currentId])],
                        }));
                      }}>
                        Mostrar respuestas de la comunidad
                      </button>
                    ) : (
                      <div className="study-practice-answers">
                        <h3>Compará con respuestas disponibles</h3>
                        <p>Las respuestas representan aportes de usuarios; pueden ser incompletas o estar equivocadas.</p>
                        {shownAnswers.length === 0 && <p>Esta pregunta todavía no tiene respuestas cargadas.</p>}
                        <ol>
                          {shownAnswers.map((answer) => (
                            <li key={answer.id}>
                              {question.acceptedAnswerId === answer.id && (
                                <strong>Respuesta aceptada por quien preguntó</strong>
                              )}
                              <p className="study-practice-body">{answer.body}</p>
                              <small>{answer.author?.displayName ?? "Participante"}</small>
                            </li>
                          ))}
                        </ol>
                        {acceptedNotLoaded && <p>La respuesta aceptada, si sigue disponible, puede estar en otra página.</p>}
                        {detail.error && <p className="study-practice-error" role="alert">{detail.error}</p>}
                        {detail.nextCursor && (
                          <button type="button" disabled={detail.loadingMore} onClick={() => void loadMoreAnswers()}>
                            {detail.loadingMore ? "Cargando…" : "Ver más respuestas"}
                          </button>
                        )}
                        <h3>Mi revisión</h3>
                        <p>Marcá cómo te sentís con el tema. No se genera una nota automática.</p>
                        <div className="study-practice-actions">
                          <button
                            type="button"
                            aria-pressed={round.outcomes[currentId ?? ""] === "review"}
                            onClick={() => markOutcome("review")}
                          >
                            Necesito repasar
                          </button>
                          <button
                            type="button"
                            aria-pressed={round.outcomes[currentId ?? ""] === "understood"}
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
                  <button type="button" disabled={round.position === 0} onClick={() => changeRound((previous) => ({
                    ...previous, position: previous.position - 1,
                  }))}>
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={round.position >= round.ids.length - 1}
                    onClick={() => changeRound((previous) => ({
                      ...previous, position: previous.position + 1,
                    }))}
                  >
                    Siguiente
                  </button>
                </div>
              </section>
              <aside className="study-practice-panel" aria-labelledby="study-practice-summary">
                <h2 id="study-practice-summary">Tu propio repaso</h2>
                <p>Estas marcas son privadas y temporales: no son una puntuación académica.</p>
                <div className="study-practice-stats" aria-live="polite">
                  <span><strong>{summary?.completed ?? 0}</strong> revisadas</span>
                  <span><strong>{summary?.review ?? 0}</strong> para repasar</span>
                  <span><strong>{summary?.understood ?? 0}</strong> explicadas</span>
                  <span><strong>{summary?.pending ?? 0}</strong> sin clasificar</span>
                </div>
                <ol className="study-practice-outline">
                  {round.ids.map((id, index) => (
                    <li key={id}>
                      <button
                        type="button"
                        className={index === round.position ? "study-practice-current" : ""}
                        aria-current={index === round.position ? "step" : undefined}
                        onClick={() => changeRound((previous) => ({
                          ...previous, position: index,
                        }))}
                      >
                        Pregunta {index + 1} · {round.outcomes[id] === "review"
                          ? "Repasar"
                          : round.outcomes[id] === "understood" ? "Explicada" : "Pendiente"}
                      </button>
                    </li>
                  ))}
                </ol>
                <h3>Continuar en el planificador</h3>
                <p>Exportá las preguntas marcadas para repasar como un plan JSON. El archivo incluye solo IDs; la Mesa vuelve a comprobar su acceso al importarlo.</p>
                <button type="button" disabled={!summary?.review} onClick={exportPending}>
                  Exportar preguntas para repasar
                </button>
                <p><Link to={`/study/session?subjectId=${encodeURIComponent(subject.id)}`}>Ir al planificador de estudio</Link></p>
              </aside>
            </div>
          )}
          {feedback && (
            <p className={feedback.error ? "study-practice-error" : "study-practice-feedback"} role={feedback.error ? "alert" : "status"}>
              {feedback.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
