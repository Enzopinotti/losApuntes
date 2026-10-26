import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import type { QuestionState, QuestionView } from "../community/interfaces";
import {
  communityApi,
  isCommunityApiError,
} from "../community/services/communityService";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";
import { practiceQuestionHref } from "./study-practice-question-link.mjs";
import {
  DEFAULT_STUDY_QUESTION_FILTER,
  normalizeStudyQuestionFilter,
  studyQuestionFilterKey,
  STUDY_QUESTION_QUERY_MAX_LENGTH,
  type StudyQuestionFilter,
} from "./study-question-explorer.mjs";
import { repeatsStudyQuestionCursor } from "./study-question-pagination.mjs";

const repeatedCursorMessage =
  "El servidor repitió una página de preguntas. Conservamos las preguntas cargadas y detuvimos la búsqueda.";

type ScopedFilter = StudyQuestionFilter & { scope: string };
type QuestionPage = {
  scope: string;
  items: QuestionView[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

type Props = {
  subjectId: string;
  subjectName: string;
  authScope: string;
};

function questionError(error: unknown): string {
  if (isCommunityApiError(error)) {
    if (error.status === 401) {
      return "La sesión venció. Iniciá sesión nuevamente.";
    }
    if (error.status === 403) {
      return "Ya no tenés permiso para consultar estas preguntas.";
    }
    if (error.status === 404) {
      return "La materia o las preguntas ya no están disponibles.";
    }
    return error.message;
  }
  return "No pudimos consultar las preguntas. Reintentá desde esta materia.";
}

export function StudySubjectQuestions({
  subjectId,
  subjectName,
  authScope,
}: Props) {
  const subjectScope = JSON.stringify([authScope, subjectId]);
  const [draftState, setDraftState] = useState<ScopedFilter | null>(null);
  const [appliedState, setAppliedState] = useState<ScopedFilter | null>(null);
  const draft: StudyQuestionFilter =
    draftState?.scope === subjectScope
      ? draftState
      : DEFAULT_STUDY_QUESTION_FILTER;
  const applied: StudyQuestionFilter =
    appliedState?.scope === subjectScope
      ? appliedState
      : DEFAULT_STUDY_QUESTION_FILTER;
  const filterScope = studyQuestionFilterKey(subjectScope, applied);
  const {
    begin: beginQuestions,
    isCurrent: isQuestionsCurrent,
    finish: finishQuestions,
  } = useAsyncAuthorityFence(
    `study-question-explorer:${filterScope ?? "invalid"}`,
  );
  const [pageState, setPageState] = useState<QuestionPage | null>(null);
  const cursorHistoryRef = useRef({
    scope: filterScope,
    cursors: new Set<string>(),
  });
  const currentPage =
    filterScope !== null && pageState?.scope === filterScope ? pageState : null;
  const validation = normalizeStudyQuestionFilter(draft);
  const questions = currentPage?.items ?? [];
  const statusDescription =
    applied.status === ""
      ? "todas las preguntas"
      : `preguntas ${applied.status === "open" ? "abiertas" : "cerradas"}`;

  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (!filterScope) return;
      const cursorHistory = cursorHistoryRef.current;
      if (append) {
        if (!cursor || cursorHistory.scope !== filterScope) return;
        if (cursorHistory.cursors.has(cursor)) {
          setPageState((previous) =>
            previous?.scope === filterScope
              ? {
                  ...previous,
                  nextCursor: null,
                  error: repeatedCursorMessage,
                }
              : previous,
          );
          return;
        }
      }
      const ticket = beginQuestions();
      if (!isQuestionsCurrent(ticket)) return;
      setPageState((previous) => ({
        scope: filterScope,
        items: append && previous?.scope === filterScope ? previous.items : [],
        nextCursor:
          append && previous?.scope === filterScope
            ? previous.nextCursor
            : null,
        loading: true,
        error: null,
      }));
      try {
        const page = await communityApi.questions(
          {
            subjectId,
            q: applied.q || undefined,
            status: applied.status || undefined,
            limit: 15,
            cursor,
          },
          ticket.signal,
        );
        if (!isQuestionsCurrent(ticket)) return;
        const repeatedCursor =
          append && cursor
            ? repeatsStudyQuestionCursor(
                cursorHistory.cursors,
                cursor,
                page.nextCursor,
              )
            : false;
        if (append && cursor) cursorHistory.cursors.add(cursor);
        else {
          cursorHistoryRef.current = {
            scope: filterScope,
            cursors: new Set<string>(),
          };
        }
        setPageState((previous) => ({
          scope: filterScope,
          items:
            append && previous?.scope === filterScope
              ? Array.from(
                  new Map(
                    [...previous.items, ...page.items].map((item) => [
                      item.id,
                      item,
                    ]),
                  ).values(),
                )
              : page.items,
          nextCursor: repeatedCursor ? null : page.nextCursor,
          loading: false,
          error: repeatedCursor ? repeatedCursorMessage : null,
        }));
      } catch (error) {
        if (!isQuestionsCurrent(ticket)) return;
        setPageState((previous) => ({
          scope: filterScope,
          items:
            append && previous?.scope === filterScope ? previous.items : [],
          nextCursor: null,
          loading: false,
          error: questionError(error),
        }));
      } finally {
        finishQuestions(ticket);
      }
    },
    [
      subjectId,
      filterScope,
      applied.q,
      applied.status,
      beginQuestions,
      isQuestionsCurrent,
      finishQuestions,
    ],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const updateDraft = (patch: Partial<StudyQuestionFilter>) => {
    setDraftState({ scope: subjectScope, ...draft, ...patch });
  };

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = normalizeStudyQuestionFilter(draft);
    if (!next) return;
    if (next.q === applied.q && next.status === applied.status) {
      void load();
    } else {
      setAppliedState({ scope: subjectScope, ...next });
    }
  };

  const reset = () => {
    setDraftState({ scope: subjectScope, ...DEFAULT_STUDY_QUESTION_FILTER });
    if (applied.q === "" && applied.status === "open") {
      void load();
    } else {
      setAppliedState({
        scope: subjectScope,
        ...DEFAULT_STUDY_QUESTION_FILTER,
      });
    }
  };

  return (
    <section
      className="study-workbench-panel"
      aria-labelledby="study-questions-title"
    >
      <header>
        <h2 id="study-questions-title">Preguntas de la materia</h2>
        <p>
          Buscá dudas por tema y consultá preguntas abiertas o discusiones
          cerradas de {subjectName}. Los estados son los publicados por sus
          autores, no una garantía de que tengan respuesta aceptada.
        </p>
      </header>
      <form className="study-workbench-question-filters" onSubmit={apply}>
        <label>
          Buscar por tema
          <input
            type="search"
            maxLength={STUDY_QUESTION_QUERY_MAX_LENGTH}
            value={draft.q}
            placeholder="Ej.: integrales"
            onChange={(event) => updateDraft({ q: event.target.value })}
          />
        </label>
        <label>
          Estado
          <select
            value={draft.status}
            onChange={(event) =>
              updateDraft({ status: event.target.value as QuestionState | "" })
            }
          >
            <option value="open">Abiertas</option>
            <option value="closed">Cerradas</option>
            <option value="">Todas</option>
          </select>
        </label>
        {!validation && (
          <p role="alert" className="study-workbench-alert">
            Usá entre 2 y 120 caracteres para buscar o dejá el campo vacío.
          </p>
        )}
        <div className="study-workbench-question-actions">
          <button type="submit" disabled={!validation || currentPage?.loading}>
            Buscar preguntas
          </button>
          <button
            type="button"
            className="study-workbench-secondary"
            disabled={currentPage?.loading}
            onClick={reset}
          >
            Restablecer
          </button>
        </div>
      </form>
      {(applied.q || applied.status !== "open") && (
        <p className="study-workbench-question-summary">
          Mostrando {statusDescription}
          {applied.q ? ` sobre «${applied.q}»` : ""}.
        </p>
      )}
      {currentPage?.error && (
        <div role="alert" className="study-workbench-alert">
          <p>{currentPage.error}</p>
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {(!currentPage || currentPage.loading) && (
        <p role="status">Cargando preguntas…</p>
      )}
      {currentPage &&
        !currentPage.loading &&
        questions.length === 0 &&
        !currentPage.error && (
          <div className="study-workbench-question-empty">
            <p>No hay preguntas visibles con estos filtros.</p>
            <Link to="/questions">Ir a Preguntas y respuestas</Link>
          </div>
        )}
      <ul>
        {questions.map((item) => (
          <li key={item.id}>
            <Link to={`/questions?id=${encodeURIComponent(item.id)}`}>
              <strong>{item.title}</strong>
            </Link>
            <small>
              {item.answerCount} respuestas ·{" "}
              {item.author?.displayName ?? "Estudiante"}
            </small>
            <span className="study-workbench-open">
              {item.state === "open" ? "Abierta" : "Cerrada"}
            </span>
            {practiceQuestionHref(subjectId, item.id) && (
              <Link
                to={practiceQuestionHref(subjectId, item.id)!}
                className="study-workbench-secondary"
              >
                Practicar esta pregunta
              </Link>
            )}
          </li>
        ))}
      </ul>
      {currentPage?.nextCursor && !currentPage.error && (
        <button
          type="button"
          className="study-workbench-secondary"
          disabled={currentPage.loading}
          onClick={() => void load(currentPage.nextCursor ?? undefined, true)}
        >
          {currentPage.loading ? "Cargando…" : "Más preguntas"}
        </button>
      )}
      <button
        type="button"
        className="study-workbench-secondary"
        disabled={!currentPage || currentPage.loading}
        onClick={() => void load()}
      >
        Actualizar preguntas
      </button>
    </section>
  );
}
