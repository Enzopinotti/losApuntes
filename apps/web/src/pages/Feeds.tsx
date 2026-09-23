import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  FeedFeedbackSignal,
  FeedItem,
  FeedMode,
  FeedOrder,
  FeedPreferencesResponse,
  FeedReasonCode,
} from "../features/feeds/interfaces";
import {
  feedsApi,
  isFeedsApiError,
} from "../features/feeds/services/feedsService";
import "./Feeds.scss";

type FeedView = "academic" | "for-you";

const reasonLabels: Record<FeedReasonCode, string> = {
  current_subject: "Materia actual",
  prioritized_subject: "Materia priorizada",
  connection: "Conexión",
  following: "Persona que seguís",
  interest_match: "Coincide con tus intereses",
  unanswered_question: "Pregunta sin responder",
  fresh: "Reciente",
  explicit_more: "Pediste ver más",
  exploration: "Descubrimiento",
};

function messageFor(error: unknown): string {
  if (!isFeedsApiError(error)) return "No pudimos cargar tu feed.";
  if (error.code === "FEED_CURSOR_STALE") {
    return "Tus preferencias cambiaron. Empezá una nueva tanda.";
  }
  if (error.code === "FEED_PREFERENCES_REVISION_CONFLICT") {
    return "Tus preferencias cambiaron en otra pestaña. Recargá antes de editar.";
  }
  return error.message;
}

const Feeds = () => {
  const [view, setView] = useState<FeedView>("academic");
  const [mode, setMode] = useState<FeedMode>("balanced");
  const [order, setOrder] = useState<FeedOrder>("ranked");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [stopReason, setStopReason] = useState<"end" | "natural_break" | null>(
    null,
  );
  const [preferences, setPreferences] =
    useState<FeedPreferencesResponse | null>(null);
  const [effectiveSignals, setEffectiveSignals] = useState<{
    academic: boolean;
    social: boolean;
    interests: boolean;
    relationWindowTruncated?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    try {
      setPreferences(await feedsApi.preferences());
    } catch (nextError) {
      setError(messageFor(nextError));
    }
  }, []);

  const loadFeed = useCallback(
    async (cursor?: string, append = false) => {
      if (append) setBusy("more");
      else setLoading(true);
      setError(null);

      try {
        const result =
          view === "academic"
            ? await feedsApi.academic({ limit: 8, cursor })
            : await feedsApi.forYou({ limit: 8, cursor, mode, order });

        setItems((current) =>
          append ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.nextCursor);
        setStopReason(result.stopReason);
        setEffectiveSignals(
          "effectiveSignals" in result ? result.effectiveSignals : null,
        );
      } catch (nextError) {
        setError(messageFor(nextError));
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setBusy(null);
      }
    },
    [mode, order, view],
  );

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const updatePreference = async (
    patch: Parameters<typeof feedsApi.updatePreferences>[1],
  ) => {
    if (!preferences) return;
    setBusy("preferences");
    setError(null);

    try {
      const next = await feedsApi.updatePreferences(
        preferences.preferences,
        patch,
      );
      setPreferences(next);
      await loadFeed();
    } catch (nextError) {
      setError(messageFor(nextError));
      await loadPreferences();
    } finally {
      setBusy(null);
    }
  };

  const updateSubjectPreference = async (
    subjectId: string,
    action: "prioritize" | "mute",
  ) => {
    if (!preferences) return;

    if (action === "prioritize") {
      const next = new Set(preferences.preferences.prioritizedSubjectIds);
      next.add(subjectId);
      await updatePreference({ prioritizedSubjectIds: [...next] });
      return;
    }

    const next = new Set(preferences.preferences.mutedSubjectIds);
    next.add(subjectId);
    await updatePreference({ mutedSubjectIds: [...next] });
  };

  const muteAuthor = async (profileId: string) => {
    if (!preferences) return;
    const next = new Set(preferences.preferences.mutedProfileIds);
    next.add(profileId);
    await updatePreference({ mutedProfileIds: [...next] });
  };

  const feedback = async (item: FeedItem, signal: FeedFeedbackSignal) => {
    const key = `${item.type}:${item.id}:${signal}`;
    setBusy(key);
    setError(null);

    try {
      await feedsApi.setFeedback(item.type, item.id, signal);
      await loadPreferences();
      await loadFeed();
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="feeds-page" aria-labelledby="feeds-title">
      <header className="feeds-hero">
        <div>
          <p className="feeds-eyebrow">Inicio académico</p>
          <h1 id="feeds-title">Tu feed</h1>
          <p>
            Priorizamos contexto académico, relaciones útiles y diversidad; no
            tiempo de pantalla infinito.
          </p>
        </div>
        <div className="feeds-tabs" role="group" aria-label="Tipo de feed">
          <button
            type="button"
            className={view === "academic" ? "active" : ""}
            onClick={() => setView("academic")}
          >
            Mis materias
          </button>
          <button
            type="button"
            className={view === "for-you" ? "active" : ""}
            onClick={() => setView("for-you")}
          >
            Para vos
          </button>
        </div>
      </header>

      {error && (
        <p className="feeds-error" role="alert">
          {error}
        </p>
      )}

      {view === "for-you" && (
        <section className="feeds-controls" aria-label="Controles Para vos">
          <label>
            Modo
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as FeedMode)}
            >
              <option value="balanced">Equilibrado</option>
              <option value="study">Estudio</option>
              <option value="discover">Descubrir</option>
              <option value="community">Comunidad</option>
            </select>
          </label>
          <label>
            Orden
            <select
              value={order}
              onChange={(event) => setOrder(event.target.value as FeedOrder)}
            >
              <option value="ranked">Relevancia transparente</option>
              <option value="chronological">Cronológico</option>
            </select>
          </label>

          {preferences && (
            <div className="feeds-signal-controls">
              <label>
                <input
                  type="checkbox"
                  checked={preferences.preferences.useAcademic}
                  disabled={busy === "preferences"}
                  onChange={(event) =>
                    void updatePreference({
                      useAcademic: event.target.checked,
                    })
                  }
                />
                Contexto académico
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.preferences.useSocial}
                  disabled={busy === "preferences"}
                  onChange={(event) =>
                    void updatePreference({
                      useSocial: event.target.checked,
                    })
                  }
                />
                Red
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.preferences.useInterests}
                  disabled={busy === "preferences"}
                  onChange={(event) =>
                    void updatePreference({
                      useInterests: event.target.checked,
                    })
                  }
                />
                Intereses
              </label>
            </div>
          )}
        </section>
      )}

      {preferences &&
        (preferences.preferences.mutedSubjectIds.length > 0 ||
          preferences.preferences.mutedProfileIds.length > 0 ||
          preferences.preferences.prioritizedSubjectIds.length > 0) && (
          <details className="feeds-preferences">
            <summary>Preferencias activas</summary>
            <p>
              Materias priorizadas:{" "}
              {preferences.preferences.prioritizedSubjectIds.length}
            </p>
            <p>
              Materias silenciadas:{" "}
              {preferences.preferences.mutedSubjectIds.length}
            </p>
            <p>
              Perfiles silenciados:{" "}
              {preferences.preferences.mutedProfileIds.length}
            </p>
            <button
              type="button"
              className="secondary"
              disabled={busy === "preferences"}
              onClick={() =>
                void updatePreference({
                  prioritizedSubjectIds: [],
                  mutedSubjectIds: [],
                  mutedProfileIds: [],
                })
              }
            >
              Restablecer filtros
            </button>
          </details>
        )}

      {effectiveSignals && (
        <p className="feeds-signals" role="status">
          Señales efectivas: académico {effectiveSignals.academic ? "sí" : "no"}{" "}
          · red {effectiveSignals.social ? "sí" : "no"} · intereses{" "}
          {effectiveSignals.interests ? "sí" : "no"}
          {effectiveSignals.relationWindowTruncated ? " · red acotada" : ""}
        </p>
      )}

      {loading ? (
        <p role="status">Preparando una tanda útil…</p>
      ) : items.length === 0 ? (
        <section className="feeds-empty">
          <h2>No hay contenido para esta tanda</h2>
          <p>
            Podés revisar tus materias, cambiar señales o volver a buscar más
            tarde. No rellenamos el feed con contenido irrelevante.
          </p>
        </section>
      ) : (
        <div className="feeds-list">
          {items.map((item) => (
            <article className="feed-card" key={`${item.type}:${item.id}`}>
              <header>
                <div>
                  <span className="feed-kind">
                    {item.type === "resource" ? "Apunte" : "Pregunta"}
                  </span>
                  <h2>{item.title}</h2>
                  <p className="feed-meta">
                    {item.author.displayName} · {item.academic.subject.name}
                  </p>
                </div>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleDateString("es-AR")}
                </time>
              </header>

              {item.summary && <p>{item.summary}</p>}

              <div className="feed-why" aria-label="Por qué aparece">
                {item.why.map((reason) => (
                  <span key={reason}>{reasonLabels[reason]}</span>
                ))}
              </div>

              <div className="feeds-actions">
                {item.type === "question" ? (
                  <Link to={`/questions?id=${encodeURIComponent(item.id)}`}>
                    Abrir pregunta
                  </Link>
                ) : (
                  <Link
                    to={`/resources?q=${encodeURIComponent(
                      item.title,
                    )}&subjectId=${encodeURIComponent(item.academic.subject.id)}`}
                  >
                    Buscar apunte
                  </Link>
                )}
                <button
                  type="button"
                  className="secondary"
                  disabled={Boolean(busy)}
                  onClick={() => void feedback(item, "more")}
                >
                  Ver más así
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={Boolean(busy)}
                  onClick={() => void feedback(item, "less")}
                >
                  Ver menos así
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy === "preferences"}
                  onClick={() =>
                    void updateSubjectPreference(
                      item.academic.subject.id,
                      "prioritize",
                    )
                  }
                >
                  Priorizar materia
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy === "preferences"}
                  onClick={() =>
                    void updateSubjectPreference(
                      item.academic.subject.id,
                      "mute",
                    )
                  }
                >
                  Silenciar materia
                </button>
                {item.author.profileId && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy === "preferences"}
                    onClick={() => void muteAuthor(item.author.profileId!)}
                  >
                    Silenciar autor
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && nextCursor && stopReason === null && (
        <div className="feeds-more">
          <button
            type="button"
            disabled={busy === "more"}
            onClick={() => void loadFeed(nextCursor, true)}
          >
            {busy === "more" ? "Cargando…" : "Ver otra tanda"}
          </button>
        </div>
      )}

      {!loading && stopReason === "natural_break" && (
        <section className="feeds-stop" aria-live="polite">
          <h2>Fin de esta tanda</h2>
          <p>
            Llegaste al corte natural del feed. Podés seguir con otra tarea o,
            si lo elegís, empezar una sesión nueva.
          </p>
          <button type="button" onClick={() => void loadFeed()}>
            Empezar una nueva sesión
          </button>
        </section>
      )}
    </section>
  );
};

export default Feeds;
