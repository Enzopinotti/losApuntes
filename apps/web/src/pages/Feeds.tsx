import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  FeedFeedbackSignal,
  FeedItem,
  FeedMode,
  FeedOrder,
  FeedPreferencesResponse,
  FeedReasonCode,
} from "../features/feeds/interfaces";
import { FeedSourceAttribution } from "../features/feeds/components/FeedSourceAttribution";
import {
  feedsApi,
  isFeedsApiError,
} from "../features/feeds/services/feedsService";
import {
  appendUniqueFeedItems,
  canAutomaticallyLoadWebFeed,
  didFeedCursorAdvance,
  FEED_PREFETCH_ROOT_MARGIN,
  requiresNewWebFeedSession,
} from "../features/feeds/feed-pagination.mjs";
import {
  feedSelectionFromSearchParams,
  type FeedSelection,
} from "../features/feeds/feed-navigation.mjs";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./Feeds.scss";

type FeedErrorRecovery = { kind: "page"; cursor: string } | { kind: "session" };

const reasonLabels: Record<FeedReasonCode, string> = {
  current_subject: "De tu materia actual",
  prioritized_subject: "De una materia priorizada",
  connection: "De una conexión",
  following: "De alguien que seguís",
  organization_following: "De una organización que seguís",
  interest_match: "Relacionado con tus intereses",
  unanswered_question: "Pregunta sin responder",
  fresh: "Publicado recientemente",
  explicit_more: "Por tu preferencia de ver más",
  exploration: "Para descubrir contenido",
};

function messageFor(error: unknown): string {
  if (!isFeedsApiError(error)) return "No pudimos cargar tu feed.";
  if (error.code === "FEED_CURSOR_STALE") {
    return "Tus preferencias cambiaron. Empezá una nueva tanda.";
  }
  if (error.code === "FEED_CURSOR_CONTEXT_MISMATCH") {
    return "Tu contexto cambió. Empezá una nueva tanda.";
  }
  if (error.code === "FEED_CURSOR_INVALID") {
    return "Este cursor ya no es válido. Empezá una nueva tanda.";
  }
  if (error.code === "FEED_PREFERENCES_REVISION_CONFLICT") {
    return "Tus preferencias cambiaron en otra pestaña. Recargá antes de editar.";
  }
  return error.message;
}

const Feeds = () => {
  const { status, user, session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { view, mode, order } = feedSelectionFromSearchParams(searchParams);
  const updateSelection = (selection: Partial<FeedSelection>) => {
    setSearchParams(
      (current) => {
        const next = feedSelectionFromSearchParams(current);
        const updated = { ...next, ...selection };
        const params = new URLSearchParams(current);
        params.set("view", updated.view);
        params.set("mode", updated.mode);
        params.set("order", updated.order);
        return params;
      },
      { replace: true },
    );
  };
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
  const [feedErrorRecovery, setFeedErrorRecovery] =
    useState<FeedErrorRecovery | null>(null);
  const continuationRef = useRef<HTMLDivElement | null>(null);
  const inFlightPageRef = useRef<{ key: string } | null>(null);
  const rootRequestRef = useRef<object | null>(null);
  const usedCursorsRef = useRef<Set<string>>(new Set());
  const dataScopeRef = useRef<string | null>(null);
  const latestCursorRef = useRef<string | null>(nextCursor);
  if (rootRequestRef.current === null) latestCursorRef.current = nextCursor;
  const authorityScope = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const feedRequestScope = [authorityScope, view, mode, order].join(":");
  const {
    begin: beginPreferencesRequest,
    isCurrent: isPreferencesRequestCurrent,
    finish: finishPreferencesRequest,
  } = useAsyncAuthorityFence(`feeds-preferences:${authorityScope}`);
  const {
    begin: beginFeedRequest,
    isCurrent: isFeedRequestCurrent,
    finish: finishFeedRequest,
  } = useAsyncAuthorityFence(
    `feeds:${authorityScope}:${view}:${mode}:${order}`,
  );
  const {
    begin: beginActionRequest,
    isCurrent: isActionRequestCurrent,
    finish: finishActionRequest,
  } = useAsyncAuthorityFence(
    `feeds-action:${authorityScope}:${view}:${mode}:${order}`,
  );

  const loadPreferences = useCallback(async () => {
    const ticket = beginPreferencesRequest();

    try {
      const nextPreferences = await feedsApi.preferences(ticket.signal);
      if (isPreferencesRequestCurrent(ticket)) {
        setPreferences(nextPreferences);
      }
    } catch (nextError) {
      if (isPreferencesRequestCurrent(ticket)) {
        setError(messageFor(nextError));
      }
    } finally {
      finishPreferencesRequest(ticket);
    }
  }, [
    beginPreferencesRequest,
    finishPreferencesRequest,
    isPreferencesRequestCurrent,
  ]);

  const loadFeed = useCallback(
    async (cursor?: string, append = false) => {
      if (append && (!cursor || cursor !== latestCursorRef.current)) return;

      const pageKey = append ? `${feedRequestScope}:${cursor ?? ""}` : null;
      if (pageKey && inFlightPageRef.current?.key === pageKey) return;
      const pageRequest = pageKey ? { key: pageKey } : null;
      const rootRequest = append ? null : {};
      if (pageRequest) inFlightPageRef.current = pageRequest;
      if (rootRequest) {
        rootRequestRef.current = rootRequest;
        latestCursorRef.current = null;
      }

      const ticket = beginFeedRequest();
      if (append) setBusy("more");
      else {
        setLoading(true);
        inFlightPageRef.current = null;
      }
      setError(null);
      setFeedErrorRecovery(null);

      try {
        const result =
          view === "academic"
            ? await feedsApi.academic({ limit: 8, cursor }, ticket.signal)
            : await feedsApi.forYou(
                { limit: 8, cursor, mode, order },
                ticket.signal,
              );

        if (!isFeedRequestCurrent(ticket)) return;

        if (!append) {
          usedCursorsRef.current.clear();
          dataScopeRef.current = feedRequestScope;
        }
        setItems((current) =>
          appendUniqueFeedItems(append ? current : [], result.items),
        );
        const cursorAdvanced =
          append &&
          cursor &&
          didFeedCursorAdvance(
            cursor,
            result.nextCursor,
            usedCursorsRef.current,
          );
        if (append && cursor) usedCursorsRef.current.add(cursor);
        if (append && cursor && !cursorAdvanced) {
          setNextCursor(null);
          setStopReason(null);
          setError(
            "La tanda no avanzó. Empezá una nueva sesión para continuar.",
          );
          setFeedErrorRecovery({ kind: "session" });
        } else {
          setNextCursor(result.nextCursor);
          setStopReason(result.stopReason);
        }
        setEffectiveSignals(
          "effectiveSignals" in result ? result.effectiveSignals : null,
        );
      } catch (nextError) {
        if (!isFeedRequestCurrent(ticket)) return;
        setError(messageFor(nextError));
        const mustStartNewSession =
          isFeedsApiError(nextError) &&
          requiresNewWebFeedSession(nextError.code);
        setFeedErrorRecovery(
          append && cursor && !mustStartNewSession
            ? { kind: "page", cursor }
            : { kind: "session" },
        );
        if (!append) {
          if (dataScopeRef.current !== feedRequestScope) {
            dataScopeRef.current = null;
            setItems([]);
            setNextCursor(null);
            setStopReason(null);
            setEffectiveSignals(null);
          }
        }
      } finally {
        if (pageRequest && inFlightPageRef.current === pageRequest) {
          inFlightPageRef.current = null;
        }
        if (rootRequest && rootRequestRef.current === rootRequest) {
          rootRequestRef.current = null;
        }
        if (finishFeedRequest(ticket)) {
          setLoading(false);
          setBusy(null);
        }
      }
    },
    [
      beginFeedRequest,
      dataScopeRef,
      finishFeedRequest,
      feedRequestScope,
      isFeedRequestCurrent,
      mode,
      order,
      view,
    ],
  );

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const canAutoLoadPage = canAutomaticallyLoadWebFeed({
    nextCursor,
    stopReason,
    loading,
    busy,
    hasError: Boolean(error),
  });

  useEffect(() => {
    const sentinel = continuationRef.current;
    if (
      !sentinel ||
      !nextCursor ||
      !canAutoLoadPage ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadFeed(nextCursor, true);
        }
      },
      { rootMargin: FEED_PREFETCH_ROOT_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canAutoLoadPage, loadFeed, nextCursor]);

  const updatePreference = async (
    patch: Parameters<typeof feedsApi.updatePreferences>[1],
  ) => {
    if (!preferences) return;
    const ticket = beginActionRequest();
    setBusy("preferences");
    setError(null);
    setFeedErrorRecovery(null);

    try {
      const next = await feedsApi.updatePreferences(
        preferences.preferences,
        patch,
        ticket.signal,
      );
      if (!isActionRequestCurrent(ticket)) return;
      setPreferences(next);
      await loadFeed();
    } catch (nextError) {
      if (!isActionRequestCurrent(ticket)) return;
      setError(messageFor(nextError));
      await loadPreferences();
    } finally {
      if (finishActionRequest(ticket)) {
        setBusy(null);
      }
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
    const ticket = beginActionRequest();
    const key = `${item.type}:${item.id}:${signal}`;
    setBusy(key);
    setError(null);
    setFeedErrorRecovery(null);

    try {
      await feedsApi.setFeedback(item.type, item.id, signal, ticket.signal);
      if (!isActionRequestCurrent(ticket)) return;
      await loadPreferences();
      await loadFeed();
    } catch (nextError) {
      if (isActionRequestCurrent(ticket)) {
        setError(messageFor(nextError));
      }
    } finally {
      if (finishActionRequest(ticket)) {
        setBusy(null);
      }
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
            aria-pressed={view === "academic"}
            onClick={() => updateSelection({ view: "academic" })}
          >
            Mis materias
          </button>
          <button
            type="button"
            className={view === "for-you" ? "active" : ""}
            aria-pressed={view === "for-you"}
            onClick={() => updateSelection({ view: "for-you" })}
          >
            Para vos
          </button>
        </div>
      </header>

      {error && (
        <div className="feeds-error" role="alert">
          <p>{error}</p>
          {feedErrorRecovery ? (
            <button
              type="button"
              onClick={() =>
                feedErrorRecovery.kind === "page"
                  ? void loadFeed(feedErrorRecovery.cursor, true)
                  : void loadFeed()
              }
            >
              {feedErrorRecovery.kind === "page"
                ? "Reintentar esta página"
                : items.length > 0
                  ? "Empezar una nueva sesión"
                  : "Reintentar el feed"}
            </button>
          ) : null}
        </div>
      )}

      {view === "for-you" && (
        <section className="feeds-controls" aria-label="Controles Para vos">
          <label>
            Modo
            <select
              value={mode}
              onChange={(event) =>
                updateSelection({ mode: event.target.value as FeedMode })
              }
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
              onChange={(event) =>
                updateSelection({ order: event.target.value as FeedOrder })
              }
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

      {!loading &&
        dataScopeRef.current === feedRequestScope &&
        effectiveSignals && (
          <p className="feeds-signals" role="status">
            Señales efectivas: académico{" "}
            {effectiveSignals.academic ? "sí" : "no"} · red{" "}
            {effectiveSignals.social ? "sí" : "no"} · intereses{" "}
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
                    {item.type === "resource"
                      ? "Apunte"
                      : item.type === "question"
                        ? "Pregunta"
                        : "Organización"}
                  </span>
                  <h2>{item.title}</h2>
                  <p className="feed-meta">
                    <FeedSourceAttribution item={item} />
                    {item.academic.subject
                      ? ` · ${item.academic.subject.name}`
                      : ""}
                  </p>
                  {item.source.kind === "campus_organization" &&
                  item.source.organization.verificationState === "verified" ? (
                    <span className="feed-verified">
                      Organización verificada
                    </span>
                  ) : null}
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
                ) : item.type === "organization_post" &&
                  item.source.kind === "campus_organization" ? (
                  <Link
                    to={`/organizations/${encodeURIComponent(
                      item.source.organization.id,
                    )}`}
                  >
                    Ver organización
                  </Link>
                ) : (
                  <Link
                    to={`/resources?q=${encodeURIComponent(item.title)}${
                      item.academic.subject
                        ? `&subjectId=${encodeURIComponent(
                            item.academic.subject.id,
                          )}`
                        : ""
                    }`}
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
                {item.academic.subject && (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy === "preferences"}
                      onClick={() =>
                        void updateSubjectPreference(
                          item.academic.subject!.id,
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
                          item.academic.subject!.id,
                          "mute",
                        )
                      }
                    >
                      Silenciar materia
                    </button>
                  </>
                )}
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
        <div className="feeds-continuation">
          {busy === "more" ? (
            <p className="feeds-page-loading" role="status">
              Cargando más publicaciones…
            </p>
          ) : null}
          <div
            ref={continuationRef}
            className="feeds-sentinel"
            aria-hidden="true"
          />
          {typeof IntersectionObserver === "undefined" &&
          busy === null &&
          !error ? (
            <button
              type="button"
              onClick={() => void loadFeed(nextCursor, true)}
            >
              Continuar feed
            </button>
          ) : null}
        </div>
      )}

      {!loading &&
        stopReason !== null &&
        (items.length > 0 || stopReason === "natural_break") && (
          <section className="feeds-stop" aria-live="polite">
            <h2>
              {stopReason === "natural_break"
                ? "Fin de esta tanda"
                : "Llegaste al final de esta tanda"}
            </h2>
            <p>
              {stopReason === "natural_break"
                ? "El servidor hizo una pausa natural. Podés seguir con otra sección o elegir empezar una sesión nueva."
                : "No quedan más publicaciones disponibles en esta tanda."}
            </p>
            {stopReason === "natural_break" ? (
              <button type="button" onClick={() => void loadFeed()}>
                Empezar una nueva sesión
              </button>
            ) : null}
          </section>
        )}
    </section>
  );
};

export default Feeds;
