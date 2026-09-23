import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  AnswerView,
  QuestionDetailResponse,
  QuestionState,
  QuestionView,
} from "../features/community/interfaces";
import {
  communityApi,
  isCommunityApiError,
} from "../features/community/services/communityService";
import type { AcademicSubjectOption } from "../features/resources/interfaces";
import { resourcesApi } from "../features/resources/services/resourcesService";
import "./Community.scss";

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
  const { status } = useAuth();
  const authenticated = status === "authenticated";
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get("id");
  const [items, setItems] = useState<QuestionView[]>([]);
  const [selected, setSelected] = useState<QuestionDetailResponse | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuestionState | "">("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [subjectQuery, setSubjectQuery] = useState("");
  const [subjectOptions, setSubjectOptions] = useState<AcademicSubjectOption[]>(
    [],
  );
  const [subject, setSubject] = useState<AcademicSubjectOption | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [answerBody, setAnswerBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editAnswerId, setEditAnswerId] = useState<string | null>(null);
  const [editAnswerBody, setEditAnswerBody] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await communityApi.questions({
        q: query.trim() || undefined,
        status: statusFilter || undefined,
      });
      setItems(result.items);
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

  const openQuestion = useCallback(
    async (id: string) => {
      setBusy(`open:${id}`);
      setError(null);
      try {
        const detail = await communityApi.question(id);
        setSelected(detail);
        setEditTitle(detail.question.title);
        setEditBody(detail.question.body);
        setSearchParams({ id });
      } catch (nextError) {
        setError(messageFor(nextError));
      } finally {
        setBusy(null);
      }
    },
    [setSearchParams],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (initialId) void openQuestion(initialId);
  }, [initialId, openQuestion]);

  const searchSubjects = async () => {
    if (subjectQuery.trim().length < 2) return;
    setError(null);
    try {
      setSubjectOptions(await resourcesApi.searchSubjects(subjectQuery.trim()));
    } catch {
      setError("No pudimos buscar materias.");
    }
  };

  const createQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subject) return;

    setBusy("create-question");
    setError(null);
    setFeedback(null);
    try {
      const result = await communityApi.createQuestion({
        subjectId: subject.id,
        title,
        body,
      });
      setTitle("");
      setBody("");
      setSubject(null);
      setSubjectOptions([]);
      setSubjectQuery("");
      setFeedback("Pregunta publicada.");
      await loadList();
      await openQuestion(result.question.id);
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  const createAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;

    setBusy("answer");
    setError(null);
    try {
      await communityApi.createAnswer(selected.question.id, answerBody);
      setAnswerBody("");
      setFeedback("Respuesta publicada.");
      await openQuestion(selected.question.id);
      await loadList();
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  const updateQuestion = async (patch: {
    title?: string;
    body?: string;
    status?: QuestionState;
  }) => {
    if (!selected) return;
    setBusy("edit-question");
    setError(null);
    try {
      await communityApi.updateQuestion(selected.question, patch);
      setFeedback("Pregunta actualizada.");
      await openQuestion(selected.question.id);
      await loadList();
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  const updateAnswer = async (answer: AnswerView) => {
    setBusy(`edit-answer:${answer.id}`);
    setError(null);
    try {
      await communityApi.updateAnswer(answer, editAnswerBody);
      setEditAnswerId(null);
      setEditAnswerBody("");
      if (selected) await openQuestion(selected.question.id);
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  const acceptAnswer = async (answerId: string) => {
    if (!selected) return;
    setBusy(`accept:${answerId}`);
    setError(null);
    try {
      await communityApi.acceptAnswer(selected.question, answerId);
      setFeedback("Respuesta aceptada.");
      await openQuestion(selected.question.id);
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  const reportQuestion = async () => {
    if (!selected) return;
    setBusy("report-question");
    setError(null);
    try {
      await communityApi.reportQuestion(selected.question.id);
      setFeedback("Reporte recibido para revisión.");
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  const reportAnswer = async (answerId: string) => {
    setBusy(`report:${answerId}`);
    setError(null);
    try {
      await communityApi.reportAnswer(answerId);
      setFeedback("Reporte recibido para revisión.");
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="community-page" aria-labelledby="questions-title">
      <header className="community-hero">
        <p className="community-eyebrow">Preguntas y respuestas</p>
        <h1 id="questions-title">Resolver dudas dentro del contexto académico</h1>
        <p>
          Las preguntas conservan su materia canónica. Leer es público; publicar
          requiere una cuenta verificada y un perfil.
        </p>
      </header>

      {feedback && <p className="community-success" role="status">{feedback}</p>}
      {error && <p className="community-error" role="alert">{error}</p>}

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
            {subject && <p>Materia: <strong>{subject.name}</strong></p>}
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
        </section>

        <section className="community-card">
          {!selected ? (
            <p>Elegí una pregunta para leerla completa.</p>
          ) : (
            <>
              <header className="community-question-header">
                <span className="community-status">{selected.question.state}</span>
                <h2>{selected.question.title}</h2>
                <p>{selected.question.body}</p>
                <small>
                  {selected.question.author?.displayName ??
                    "Usuario de Los Apuntes"}{" "}
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
                        {answer.author?.displayName ?? "Usuario de Los Apuntes"}
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
                        {answer.viewer.canEdit && editAnswerId !== answer.id && (
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
