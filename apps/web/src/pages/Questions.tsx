import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  AnswerView,
  CommunityPerson,
  QuestionDetailResponse,
  QuestionState,
  QuestionView,
} from "../features/community/interfaces";
import {
  communityApi,
  isCommunityApiError,
} from "../features/community/services/communityService";
import {
  appendUniqueItems,
  questionCursorRepeats,
} from "../features/community/questionPagination";
import {
  feedReturnHref,
  feedReturnRestoreState,
} from "../features/feeds/feed-navigation.mjs";
import type { AcademicSubjectOption } from "../features/resources/interfaces";
import { resourcesApi } from "../features/resources/services/resourcesService";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./Community.scss";

function CommunityAuthorAttribution({
  author,
}: {
  author: CommunityPerson | null;
}) {
  const displayName = author?.displayName.trim() || "Usuario de Los Apuntes";
  const profileId = author?.profileId;
  if (!profileId || profileId.trim() !== profileId) return displayName;

  return (
    <Link
      aria-label={`Ver perfil de ${displayName}`}
      className="community-author-link"
      to={`/p/${encodeURIComponent(profileId)}`}
    >
      {displayName}
    </Link>
  );
}

function appendAnswers(
  current: AnswerView[],
  next: AnswerView[],
): AnswerView[] {
  return appendUniqueItems(current, next);
}

function messageFor(error: unknown): string {
  if (!isCommunityApiError(error)) {
    return "No pudimos completar la operación.";
  }

  if (error.code === "EMAIL_VERIFICATION_REQUIRED") {
    return "Verificá tu email antes de publicar o editar contenido.";
  }
  if (error.code === "QA_PROFILE_REQUIRED") {
    return "Completá tu perfil antes de participar en preguntas y respuestas.";
  }
  if (
    error.code === "QUESTION_REVISION_CONFLICT" ||
    error.code === "ANSWER_REVISION_CONFLICT"
  ) {
    return "El contenido cambió en otra pestaña. Recargalo antes de guardar.";
  }

  return error.message;
}

const Questions = () => {
  const { status, user, session } = useAuth();
  const authenticated = status === "authenticated";
  const location = useLocation();
  const feedReturnTo = feedReturnHref(location.state);
  const viewerScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get("id");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuestionState | "">("");
  const listScopeKey = [
    viewerScopeKey,
    query.trim(),
    statusFilter || "all-states",
  ].join(":");
  const {
    begin: beginList,
    isCurrent: isListCurrent,
    finish: finishList,
  } = useAsyncAuthorityFence(`questions-list:${listScopeKey}`);

  const detailScopeKey = [viewerScopeKey, initialId ?? "no-question"].join(":");
  const {
    begin: beginDetail,
    isCurrent: isDetailCurrent,
    finish: finishDetail,
  } = useAsyncAuthorityFence(`questions-detail:${detailScopeKey}`);

  const [subjectQuery, setSubjectQuery] = useState("");
  const subjectSearchScopeKey = [viewerScopeKey, subjectQuery.trim()].join(":");
  const {
    begin: beginSubjectSearch,
    isCurrent: isSubjectSearchCurrent,
    finish: finishSubjectSearch,
  } = useAsyncAuthorityFence(
    `questions-subject-search:${subjectSearchScopeKey}`,
  );

  const actionScopeKey = [viewerScopeKey, initialId ?? "list"].join(":");
  const {
    begin: beginAction,
    isCurrent: isActionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(`questions-action:${actionScopeKey}`);

  const [listState, setListState] = useState<{
    scopeKey: string;
    items: QuestionView[];
    nextCursor: string | null;
    loading: boolean;
    busyMore: boolean;
    error: string | null;
    cursorCycle: boolean;
  } | null>(null);
  const loadedQuestionCursors = useRef({
    scopeKey: listScopeKey,
    cursors: new Set<string>(),
  });
  const currentListState =
    listState?.scopeKey === listScopeKey ? listState : null;
  const items = currentListState?.items ?? [];
  const nextCursor = currentListState?.nextCursor ?? null;
  const loading = currentListState?.loading ?? true;

  const [detailState, setDetailState] = useState<{
    scopeKey: string;
    detail: QuestionDetailResponse | null;
    loading: boolean;
    busyMore: boolean;
    error: string | null;
    answersCursorCycle: boolean;
  } | null>(null);
  const loadedAnswerCursors = useRef({
    scopeKey: detailScopeKey,
    cursors: new Set<string>(),
  });
  const currentDetailState =
    detailState?.scopeKey === detailScopeKey ? detailState : null;
  const selected = currentDetailState?.detail ?? null;
  const detailLoading = currentDetailState?.loading ?? Boolean(initialId);
  const questionsCursorCycle = currentListState?.cursorCycle ?? false;
  const answersCursorCycle = currentDetailState?.answersCursorCycle ?? false;

  const [subjectSearchState, setSubjectSearchState] = useState<{
    scopeKey: string;
    busy: boolean;
    error: string | null;
    options: AcademicSubjectOption[];
  } | null>(null);
  const currentSubjectSearchState =
    subjectSearchState?.scopeKey === subjectSearchScopeKey
      ? subjectSearchState
      : null;
  const subjectOptions = currentSubjectSearchState?.options ?? [];

  const [subjectSelection, setSubjectSelection] = useState<{
    scopeKey: string;
    subject: AcademicSubjectOption;
  } | null>(null);
  const subject =
    subjectSelection?.scopeKey === viewerScopeKey
      ? subjectSelection.subject
      : null;
  const setSubject = useCallback(
    (next: AcademicSubjectOption | null) => {
      setSubjectSelection(
        next ? { scopeKey: viewerScopeKey, subject: next } : null,
      );
    },
    [viewerScopeKey],
  );

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [answerBody, setAnswerBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editAnswerId, setEditAnswerId] = useState<string | null>(null);
  const [editAnswerBody, setEditAnswerBody] = useState("");

  const [actionState, setActionState] = useState<{
    scopeKey: string;
    busy: string | null;
    error: string | null;
  } | null>(null);
  const currentActionState =
    actionState?.scopeKey === actionScopeKey ? actionState : null;

  const [feedbackState, setFeedbackState] = useState<{
    scopeKey: string;
    message: string;
  } | null>(null);
  const feedback =
    feedbackState?.scopeKey === viewerScopeKey ? feedbackState.message : null;

  const error =
    currentActionState?.error ??
    currentSubjectSearchState?.error ??
    currentDetailState?.error ??
    currentListState?.error ??
    null;

  const busy =
    currentActionState?.busy ??
    (currentListState?.busyMore ? "questions-more" : null) ??
    (currentDetailState?.busyMore ? "answers-more" : null) ??
    (detailLoading && initialId ? `open:${initialId}` : null);

  const loadList = useCallback(
    async (cursor?: string, append = false) => {
      const ticket = beginList();
      if (!isListCurrent(ticket)) return;

      setListState((current) => ({
        scopeKey: listScopeKey,
        items: current?.scopeKey === listScopeKey ? current.items : [],
        nextCursor:
          current?.scopeKey === listScopeKey ? current.nextCursor : null,
        loading: !append,
        busyMore: append,
        error: null,
        cursorCycle:
          current?.scopeKey === listScopeKey ? current.cursorCycle : false,
      }));

      try {
        const result = await communityApi.questions(
          {
            q: query.trim() || undefined,
            status: statusFilter || undefined,
            cursor,
            limit: 25,
          },
          ticket.signal,
        );
        if (!isListCurrent(ticket)) return;

        if (
          append &&
          cursor &&
          questionCursorRepeats(
            loadedQuestionCursors.current.scopeKey === listScopeKey
              ? loadedQuestionCursors.current.cursors
              : new Set<string>(),
            cursor,
            result.nextCursor,
          )
        ) {
          loadedQuestionCursors.current = {
            scopeKey: listScopeKey,
            cursors: new Set([
              ...(loadedQuestionCursors.current.scopeKey === listScopeKey
                ? loadedQuestionCursors.current.cursors
                : []),
              cursor,
            ]),
          };
          setListState((current) => {
            const previousItems =
              current?.scopeKey === listScopeKey ? current.items : [];
            return {
              scopeKey: listScopeKey,
              items: appendUniqueItems(previousItems, result.items),
              nextCursor: null,
              loading: false,
              busyMore: false,
              error:
                "La lista repitió una página. Actualizá las preguntas para continuar.",
              cursorCycle: true,
            };
          });
          return;
        }

        if (append) {
          const cursors =
            loadedQuestionCursors.current.scopeKey === listScopeKey
              ? new Set(loadedQuestionCursors.current.cursors)
              : new Set<string>();
          if (cursor) cursors.add(cursor);
          loadedQuestionCursors.current = { scopeKey: listScopeKey, cursors };
        } else {
          loadedQuestionCursors.current = {
            scopeKey: listScopeKey,
            cursors: new Set<string>(),
          };
        }

        setListState((current) => {
          const previousItems =
            current?.scopeKey === listScopeKey ? current.items : [];
          return {
            scopeKey: listScopeKey,
            items: append
              ? appendUniqueItems(previousItems, result.items)
              : result.items,
            nextCursor: result.nextCursor,
            loading: false,
            busyMore: false,
            error: null,
            cursorCycle: false,
          };
        });
      } catch (nextError) {
        if (!isListCurrent(ticket)) return;
        setListState((current) => ({
          scopeKey: listScopeKey,
          items: current?.scopeKey === listScopeKey ? current.items : [],
          nextCursor:
            current?.scopeKey === listScopeKey ? current.nextCursor : null,
          loading: false,
          busyMore: false,
          error: messageFor(nextError),
          cursorCycle:
            current?.scopeKey === listScopeKey ? current.cursorCycle : false,
        }));
      } finally {
        if (finishList(ticket)) {
          setListState((current) =>
            current?.scopeKey === listScopeKey
              ? { ...current, loading: false, busyMore: false }
              : current,
          );
        }
      }
    },
    [beginList, finishList, isListCurrent, listScopeKey, query, statusFilter],
  );
  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;

  const loadDetail = useCallback(async () => {
    if (!initialId) return;

    const ticket = beginDetail();
    if (!isDetailCurrent(ticket)) return;
    setDetailState((current) => ({
      scopeKey: detailScopeKey,
      detail: current?.scopeKey === detailScopeKey ? current.detail : null,
      loading: true,
      busyMore: false,
      error: null,
      answersCursorCycle:
        current?.scopeKey === detailScopeKey
          ? current.answersCursorCycle
          : false,
    }));

    try {
      const detail = await communityApi.question(initialId, ticket.signal);
      if (!isDetailCurrent(ticket)) return;
      loadedAnswerCursors.current = {
        scopeKey: detailScopeKey,
        cursors: new Set<string>(),
      };
      setDetailState({
        scopeKey: detailScopeKey,
        detail,
        loading: false,
        busyMore: false,
        error: null,
        answersCursorCycle: false,
      });
      setEditTitle(detail.question.title);
      setEditBody(detail.question.body);
    } catch (nextError) {
      if (!isDetailCurrent(ticket)) return;
      setDetailState({
        scopeKey: detailScopeKey,
        detail: null,
        loading: false,
        busyMore: false,
        error: messageFor(nextError),
        answersCursorCycle: false,
      });
    } finally {
      if (finishDetail(ticket)) {
        setDetailState((current) =>
          current?.scopeKey === detailScopeKey
            ? { ...current, loading: false }
            : current,
        );
      }
    }
  }, [beginDetail, detailScopeKey, finishDetail, initialId, isDetailCurrent]);
  const loadDetailRef = useRef(loadDetail);
  loadDetailRef.current = loadDetail;

  const openQuestion = useCallback(
    (id: string) => {
      if (initialId === id) {
        void loadDetailRef.current();
        return;
      }
      setSearchParams({ id });
    },
    [initialId, setSearchParams],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setAnswerBody("");
    setEditTitle("");
    setEditBody("");
    setEditAnswerId(null);
    setEditAnswerBody("");
  }, [detailScopeKey]);

  useEffect(() => {
    if (initialId) {
      void loadDetail();
    }
  }, [initialId, loadDetail]);

  useEffect(() => {
    setSubjectQuery("");
    setSubject(null);
    setTitle("");
    setBody("");
    setFeedbackState(null);
    setActionState(null);
  }, [setSubject, viewerScopeKey]);

  const searchSubjects = async () => {
    const q = subjectQuery.trim();
    if (q.length < 2) return;

    const ticket = beginSubjectSearch();
    if (!isSubjectSearchCurrent(ticket)) return;
    setSubjectSearchState({
      scopeKey: subjectSearchScopeKey,
      busy: true,
      error: null,
      options: currentSubjectSearchState?.options ?? [],
    });

    try {
      const options = await resourcesApi.searchSubjects(q, ticket.signal);
      if (!isSubjectSearchCurrent(ticket)) return;
      setSubjectSearchState({
        scopeKey: subjectSearchScopeKey,
        busy: false,
        error: null,
        options,
      });
    } catch {
      if (!isSubjectSearchCurrent(ticket)) return;
      setSubjectSearchState({
        scopeKey: subjectSearchScopeKey,
        busy: false,
        error: "No pudimos buscar materias.",
        options: [],
      });
    } finally {
      if (finishSubjectSearch(ticket)) {
        setSubjectSearchState((current) =>
          current?.scopeKey === subjectSearchScopeKey
            ? { ...current, busy: false }
            : current,
        );
      }
    }
  };

  const loadMoreAnswers = async () => {
    const target = selected;
    const cursor = target?.answersNextCursor;
    if (!target || !cursor) return;

    const ticket = beginDetail();
    if (!isDetailCurrent(ticket)) return;
    setDetailState({
      scopeKey: detailScopeKey,
      detail: target,
      loading: false,
      busyMore: true,
      error: null,
      answersCursorCycle,
    });

    try {
      const page = await communityApi.answers(
        target.question.id,
        cursor ?? undefined,
        target.answersLimit,
        ticket.signal,
      );
      if (!isDetailCurrent(ticket)) return;
      if (
        questionCursorRepeats(
          loadedAnswerCursors.current.scopeKey === detailScopeKey
            ? loadedAnswerCursors.current.cursors
            : new Set<string>(),
          cursor,
          page.nextCursor,
        )
      ) {
        const cursors =
          loadedAnswerCursors.current.scopeKey === detailScopeKey
            ? new Set(loadedAnswerCursors.current.cursors)
            : new Set<string>();
        cursors.add(cursor);
        loadedAnswerCursors.current = { scopeKey: detailScopeKey, cursors };
        setDetailState((current) =>
          current?.scopeKey === detailScopeKey &&
          current.detail?.question.id === target.question.id
            ? {
                ...current,
                detail: {
                  ...current.detail,
                  answers: appendAnswers(current.detail.answers, page.items),
                  answersNextCursor: null,
                },
                busyMore: false,
                error:
                  "Las respuestas repitieron una página. Actualizá las respuestas para continuar.",
                answersCursorCycle: true,
              }
            : current,
        );
        return;
      }
      const cursors =
        loadedAnswerCursors.current.scopeKey === detailScopeKey
          ? new Set(loadedAnswerCursors.current.cursors)
          : new Set<string>();
      cursors.add(cursor);
      loadedAnswerCursors.current = { scopeKey: detailScopeKey, cursors };
      setDetailState((current) =>
        current?.scopeKey === detailScopeKey &&
        current.detail?.question.id === target.question.id
          ? {
              ...current,
              detail: {
                ...current.detail,
                answers: appendAnswers(current.detail.answers, page.items),
                answersNextCursor: page.nextCursor,
              },
              busyMore: false,
              answersCursorCycle: false,
            }
          : current,
      );
    } catch (nextError) {
      if (!isDetailCurrent(ticket)) return;
      setDetailState((current) =>
        current?.scopeKey === detailScopeKey
          ? {
              ...current,
              busyMore: false,
              error: messageFor(nextError),
            }
          : current,
      );
    } finally {
      if (finishDetail(ticket)) {
        setDetailState((current) =>
          current?.scopeKey === detailScopeKey
            ? { ...current, busyMore: false }
            : current,
        );
      }
    }
  };

  const refreshAnswers = async () => {
    if (!selected) return;

    const target = selected;
    const ticket = beginDetail();
    if (!isDetailCurrent(ticket)) return;
    setDetailState((current) =>
      current?.scopeKey === detailScopeKey
        ? { ...current, busyMore: true, error: null }
        : current,
    );

    try {
      const page = await communityApi.answers(
        target.question.id,
        undefined,
        target.answersLimit,
        ticket.signal,
      );
      if (!isDetailCurrent(ticket)) return;
      loadedAnswerCursors.current = {
        scopeKey: detailScopeKey,
        cursors: new Set<string>(),
      };
      setDetailState((current) =>
        current?.scopeKey === detailScopeKey &&
        current.detail?.question.id === target.question.id
          ? {
              ...current,
              detail: {
                ...current.detail,
                answers: page.items,
                answersNextCursor: page.nextCursor,
              },
              busyMore: false,
              error: null,
              answersCursorCycle: false,
            }
          : current,
      );
    } catch (nextError) {
      if (!isDetailCurrent(ticket)) return;
      const missingQuestion =
        isCommunityApiError(nextError) && nextError.status === 404;
      setDetailState((current) =>
        current?.scopeKey === detailScopeKey
          ? {
              ...current,
              detail: missingQuestion ? null : current.detail,
              busyMore: false,
              error: messageFor(nextError),
              answersCursorCycle: missingQuestion
                ? false
                : current.answersCursorCycle,
            }
          : current,
      );
    } finally {
      if (finishDetail(ticket)) {
        setDetailState((current) =>
          current?.scopeKey === detailScopeKey
            ? { ...current, busyMore: false }
            : current,
        );
      }
    }
  };

  const runAction = async <T,>(
    key: string,
    operation: (signal: AbortSignal) => Promise<T>,
    onSuccess: (
      result: T,
      ticket: ReturnType<typeof beginAction>,
    ) => void | Promise<void>,
  ) => {
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;

    setActionState({
      scopeKey: actionScopeKey,
      busy: key,
      error: null,
    });
    setFeedbackState(null);

    try {
      const result = await operation(ticket.signal);
      if (!isActionCurrent(ticket)) return;
      await onSuccess(result, ticket);
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: actionScopeKey,
        busy: key,
        error: messageFor(nextError),
      });
    } finally {
      if (finishAction(ticket)) {
        setActionState((current) =>
          current?.scopeKey === actionScopeKey
            ? { ...current, busy: null }
            : current,
        );
      }
    }
  };

  const createQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subject) return;

    const targetSubject = subject;
    await runAction(
      "create-question",
      (signal) =>
        communityApi.createQuestion(
          {
            subjectId: targetSubject.id,
            title,
            body,
          },
          signal,
        ),
      async (result, ticket) => {
        setTitle("");
        setBody("");
        setSubject(null);
        setSubjectQuery("");
        setSubjectSearchState(null);
        setFeedbackState({
          scopeKey: viewerScopeKey,
          message: "Pregunta publicada.",
        });
        await loadListRef.current();
        if (!isActionCurrent(ticket)) return;
        setSearchParams({ id: result.question.id });
      },
    );
  };

  const createAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;

    const targetQuestion = selected.question;
    const draft = answerBody;
    await runAction(
      "answer",
      (signal) => communityApi.createAnswer(targetQuestion.id, draft, signal),
      async () => {
        setAnswerBody("");
        setFeedbackState({
          scopeKey: viewerScopeKey,
          message: "Respuesta publicada.",
        });
        await Promise.all([loadDetailRef.current(), loadListRef.current()]);
      },
    );
  };

  const updateQuestion = async (patch: {
    title?: string;
    body?: string;
    status?: QuestionState;
  }) => {
    if (!selected) return;

    const targetQuestion = selected.question;
    await runAction(
      "edit-question",
      (signal) => communityApi.updateQuestion(targetQuestion, patch, signal),
      async () => {
        setFeedbackState({
          scopeKey: viewerScopeKey,
          message: "Pregunta actualizada.",
        });
        await Promise.all([loadDetailRef.current(), loadListRef.current()]);
      },
    );
  };

  const updateAnswer = async (answer: AnswerView) => {
    const draft = editAnswerBody;
    await runAction(
      `edit-answer:${answer.id}`,
      (signal) => communityApi.updateAnswer(answer, draft, signal),
      async () => {
        setEditAnswerId(null);
        setEditAnswerBody("");
        await loadDetailRef.current();
      },
    );
  };

  const acceptAnswer = async (answerId: string) => {
    if (!selected) return;

    const targetQuestion = selected.question;
    await runAction(
      `accept:${answerId}`,
      (signal) => communityApi.acceptAnswer(targetQuestion, answerId, signal),
      async () => {
        setFeedbackState({
          scopeKey: viewerScopeKey,
          message: "Respuesta aceptada.",
        });
        await loadDetailRef.current();
      },
    );
  };

  const reportQuestion = async () => {
    if (!selected) return;

    const questionId = selected.question.id;
    await runAction(
      "report-question",
      (signal) => communityApi.reportQuestion(questionId, signal),
      () => {
        setFeedbackState({
          scopeKey: viewerScopeKey,
          message: "Reporte recibido para revisión.",
        });
      },
    );
  };

  const reportAnswer = async (answerId: string) => {
    await runAction(
      `report:${answerId}`,
      (signal) => communityApi.reportAnswer(answerId, signal),
      () => {
        setFeedbackState({
          scopeKey: viewerScopeKey,
          message: "Reporte recibido para revisión.",
        });
      },
    );
  };

  return (
    <section className="community-page" aria-labelledby="questions-title">
      <header className="community-hero">
        <p className="community-eyebrow">Preguntas y respuestas</p>
        <h1 id="questions-title">
          Resolver dudas dentro del contexto académico
        </h1>
        <p>
          Las preguntas conservan su materia canónica. Leer es público; publicar
          requiere una cuenta verificada y un perfil.
        </p>
      </header>

      {feedback && (
        <p className="community-success" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="community-error" role="alert">
          {error}
        </p>
      )}

      <form
        className="community-search"
        onSubmit={(event) => {
          event.preventDefault();
          void loadList();
        }}
      >
        <input
          aria-label="Buscar preguntas"
          placeholder="Buscar por título o contenido"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Filtrar estado"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as QuestionState | "")
          }
        >
          <option value="">Todas</option>
          <option value="open">Abiertas</option>
          <option value="closed">Cerradas</option>
        </select>
        <button type="submit" disabled={loading}>
          Buscar
        </button>
      </form>

      {authenticated ? (
        <details className="community-card">
          <summary>Hacer una pregunta</summary>
          <form className="community-form" onSubmit={createQuestion}>
            <label>
              Buscar materia
              <div className="community-inline">
                <input
                  minLength={2}
                  value={subjectQuery}
                  onChange={(event) => setSubjectQuery(event.target.value)}
                />
                <button type="button" onClick={() => void searchSubjects()}>
                  Buscar
                </button>
              </div>
            </label>
            {subjectOptions.length > 0 && (
              <ul className="community-list compact">
                {subjectOptions.map((option) => (
                  <li key={option.id}>
                    <button type="button" onClick={() => setSubject(option)}>
                      {option.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {subject && (
              <p>
                Materia: <strong>{subject.name}</strong>
              </p>
            )}
            <label>
              Título
              <input
                required
                minLength={5}
                maxLength={180}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              Detalle
              <textarea
                required
                minLength={10}
                maxLength={5000}
                rows={5}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={busy === "create-question" || !subject}
            >
              Publicar pregunta
            </button>
          </form>
        </details>
      ) : (
        <p className="community-note">
          <Link to="/login">Iniciá sesión</Link> para preguntar o responder.
        </p>
      )}

      <div className="community-qa-grid">
        <section className="community-card">
          <h2>Preguntas</h2>
          {loading ? (
            <p>Cargando…</p>
          ) : items.length === 0 ? (
            <p>No encontramos preguntas.</p>
          ) : (
            <ul className="community-list">
              {items.map((question) => (
                <li key={question.id}>
                  <button
                    type="button"
                    className="community-question-link"
                    disabled={busy === `open:${question.id}`}
                    onClick={() => void openQuestion(question.id)}
                  >
                    <strong>{question.title}</strong>
                    <span>{question.academic.subject.name}</span>
                    <small>
                      {question.answerCount} respuesta(s) · {question.state}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nextCursor && (
            <button
              type="button"
              className="secondary"
              disabled={loading || busy === "questions-more"}
              onClick={() => void loadList(nextCursor, true)}
            >
              {busy === "questions-more" ? "Cargando…" : "Cargar más"}
            </button>
          )}
          {questionsCursorCycle && (
            <button
              type="button"
              className="secondary"
              disabled={loading}
              onClick={() => void loadList()}
            >
              {loading ? "Actualizando…" : "Actualizar preguntas"}
            </button>
          )}
        </section>

        <section className="community-card">
          {!selected ? (
            detailLoading ? (
              <p role="status">Cargando pregunta…</p>
            ) : (
              <p>Elegí una pregunta para leerla completa.</p>
            )
          ) : (
            <>
              <header className="community-question-header">
                {feedReturnTo && (
                  <Link
                    className="community-back-link"
                    to={feedReturnTo}
                    state={feedReturnRestoreState(location.state)}
                    replace
                  >
                    {feedReturnTo === "/"
                      ? "Volver a Inicio"
                      : "Volver al feed"}
                  </Link>
                )}
                <span className="community-status">
                  {selected.question.state}
                </span>
                <h2>{selected.question.title}</h2>
                <p>{selected.question.body}</p>
                <small>
                  <CommunityAuthorAttribution
                    author={selected.question.author}
                  />{" "}
                  · {selected.question.academic.subject.name}
                </small>
              </header>

              {selected.question.viewer.canEdit && (
                <details>
                  <summary>Editar pregunta</summary>
                  <form
                    className="community-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void updateQuestion({
                        title: editTitle,
                        body: editBody,
                      });
                    }}
                  >
                    <label>
                      Título
                      <input
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                      />
                    </label>
                    <label>
                      Detalle
                      <textarea
                        rows={4}
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                      />
                    </label>
                    <button type="submit" disabled={busy === "edit-question"}>
                      Guardar cambios
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy === "edit-question"}
                      onClick={() =>
                        void updateQuestion({
                          status:
                            selected.question.state === "open"
                              ? "closed"
                              : "open",
                        })
                      }
                    >
                      {selected.question.state === "open"
                        ? "Cerrar pregunta"
                        : "Reabrir pregunta"}
                    </button>
                  </form>
                </details>
              )}

              {authenticated && selected.question.viewer.canReport && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy === "report-question"}
                  onClick={() => void reportQuestion()}
                >
                  Reportar pregunta
                </button>
              )}

              <h3>Respuestas</h3>
              {selected.answers.length === 0 ? (
                <p>Todavía no hay respuestas.</p>
              ) : (
                <ul className="community-answer-list">
                  {selected.answers.map((answer) => (
                    <li
                      key={answer.id}
                      className={
                        selected.question.acceptedAnswerId === answer.id
                          ? "accepted"
                          : ""
                      }
                    >
                      <strong>
                        <CommunityAuthorAttribution author={answer.author} />
                      </strong>
                      {editAnswerId === answer.id ? (
                        <div>
                          <textarea
                            rows={3}
                            value={editAnswerBody}
                            onChange={(event) =>
                              setEditAnswerBody(event.target.value)
                            }
                          />
                          <button
                            type="button"
                            disabled={busy === `edit-answer:${answer.id}`}
                            onClick={() => void updateAnswer(answer)}
                          >
                            Guardar
                          </button>
                        </div>
                      ) : (
                        <p>{answer.body}</p>
                      )}
                      <div className="community-actions">
                        {answer.viewer.canEdit &&
                          editAnswerId !== answer.id && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setEditAnswerId(answer.id);
                                setEditAnswerBody(answer.body);
                              }}
                            >
                              Editar
                            </button>
                          )}
                        {selected.question.viewer.canAcceptAnswers &&
                          selected.question.acceptedAnswerId !== answer.id && (
                            <button
                              type="button"
                              disabled={busy === `accept:${answer.id}`}
                              onClick={() => void acceptAnswer(answer.id)}
                            >
                              Aceptar respuesta
                            </button>
                          )}
                        {authenticated && answer.viewer.canReport && (
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy === `report:${answer.id}`}
                            onClick={() => void reportAnswer(answer.id)}
                          >
                            Reportar
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {(selected.answersNextCursor || answersCursorCycle) && (
                <button
                  type="button"
                  className="secondary"
                  disabled={detailLoading || busy === "answers-more"}
                  onClick={() =>
                    void (answersCursorCycle
                      ? refreshAnswers()
                      : loadMoreAnswers())
                  }
                >
                  {busy === "answers-more"
                    ? "Cargando…"
                    : answersCursorCycle
                      ? "Actualizar respuestas"
                      : "Cargar más respuestas"}
                </button>
              )}

              {authenticated && selected.question.viewer.canAnswer && (
                <form className="community-form" onSubmit={createAnswer}>
                  <label>
                    Tu respuesta
                    <textarea
                      required
                      minLength={2}
                      maxLength={5000}
                      rows={4}
                      value={answerBody}
                      onChange={(event) => setAnswerBody(event.target.value)}
                    />
                  </label>
                  <button type="submit" disabled={busy === "answer"}>
                    Responder
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
};

export default Questions;
