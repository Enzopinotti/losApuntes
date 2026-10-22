import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type { FeedItem } from "../features/feeds/interfaces";
import {
  hideHomeFeedItem,
  homeFeedItemKey,
  projectHomeFeed,
  undoHomeFeedHide,
} from "../features/feeds/home-feed-momentary-hide.mjs";
import {
  FeedItemContext,
  FeedItemOpenLink,
} from "../features/feeds/components/FeedItemContext";
import {
  feedRestoreHomeIntent,
  homeFeedHref,
  type HomeFeedIntent,
} from "../features/feeds/feed-navigation.mjs";
import {
  clearFeedScrollPositions,
  feedRestorePositionKey,
  feedScrollAuthorityScope,
  takeFeedScrollPosition,
} from "../features/feeds/feed-scroll-restoration.mjs";
import {
  homeFeedEmptyGuidance,
  type HomeFeedEmptyGuidance,
} from "../features/feeds/home-feed-empty-guidance.mjs";
import type { PilotHomeResponse } from "../features/pilot/interfaces";
import {
  isPilotApiError,
  pilotApi,
} from "../features/pilot/services/pilotService";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./Pilot.scss";

function FeedPreview({
  title,
  items,
  moreTo,
  emptyGuidance,
  homeIntent,
}: {
  title: string;
  items: FeedItem[];
  moreTo: string;
  emptyGuidance: HomeFeedEmptyGuidance;
  homeIntent: HomeFeedIntent;
}) {
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [lastHiddenKey, setLastHiddenKey] = useState<string | null>(null);
  const projected = projectHomeFeed(items, hiddenKeys);

  const hide = (item: FeedItem) => {
    const key = homeFeedItemKey(item);
    setHiddenKeys((current) => hideHomeFeedItem(items, current, item));
    setLastHiddenKey(key);
  };
  const undo = () => {
    if (!lastHiddenKey) return;
    setHiddenKeys((current) => undoHomeFeedHide(current, lastHiddenKey));
    setLastHiddenKey(null);
  };
  const restoreAll = () => {
    setHiddenKeys([]);
    setLastHiddenKey(null);
  };

  return (
    <section className="pilot-card">
      <header className="pilot-card-heading">
        <h2>{title}</h2>
        <Link to={moreTo}>Ver feed completo</Link>
      </header>
      {projected.hiddenCount > 0 && (
        <div className="pilot-feed-momentary-status" role="status">
          <span>
            Apartaste {projected.hiddenCount} de esta tanda. No cambia tus
            preferencias ni reporta el contenido.
          </span>
          {lastHiddenKey && hiddenKeys.includes(lastHiddenKey) && (
            <button type="button" onClick={undo}>
              Deshacer último
            </button>
          )}
          <button type="button" onClick={restoreAll}>
            Mostrar todo
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="pilot-feed-empty" role="status">
          <p>{emptyGuidance.message}</p>
          <Link className="pilot-secondary-link" to={emptyGuidance.href}>
            {emptyGuidance.actionLabel}
          </Link>
        </div>
      ) : projected.visible.length === 0 ? (
        <div className="pilot-feed-empty" role="status">
          <p>Apartaste todos los elementos de esta tanda.</p>
          <p>Podés volver a mostrarlos sin cambiar tus recomendaciones.</p>
        </div>
      ) : (
        <ul className="pilot-feed-preview">
          {projected.visible.map((item) => {
            return (
              <li key={`${item.type}:${item.id}`}>
                <FeedItemContext
                  item={item}
                  reasonLimit={2}
                  homeIntent={homeIntent}
                />
                <div className="pilot-feed-preview-content">
                  <h3>{item.title}</h3>
                  {item.summary ? <p>{item.summary}</p> : null}
                </div>
                <FeedItemOpenLink item={item} homeIntent={homeIntent} />
                <button
                  type="button"
                  className="pilot-feed-momentary-hide"
                  onClick={() => hide(item)}
                  aria-label={`Apartar de esta tanda: ${item.title}`}
                >
                  Apartar por ahora
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Landing() {
  return (
    <section className="pilot-page pilot-landing">
      <div className="pilot-landing-copy">
        <p className="pilot-eyebrow">Los Apuntes</p>
        <h1>Tu universidad, organizada alrededor de lo que estudiás.</h1>
        <p>
          Encontrá apuntes, preguntas y personas dentro de un contexto académico
          verificable, sin un feed infinito diseñado para retenerte.
        </p>
        <div className="pilot-actions">
          <Link className="pilot-primary-link" to="/sign-up">
            Crear cuenta
          </Link>
          <Link to="/search">Explorar búsqueda</Link>
          <Link to="/resources">Ver recursos públicos</Link>
        </div>
      </div>
    </section>
  );
}

const Home = () => {
  const { status, user, session } = useAuth();
  const location = useLocation();
  const [activeHomeFeed, setActiveHomeFeed] = useState<HomeFeedIntent>(
    () =>
      feedRestoreHomeIntent(
        location.state,
        `${location.pathname}${location.search}`,
      ) ?? "contextual",
  );
  const authScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const scrollAuthorityScope = feedScrollAuthorityScope(
    status,
    user?.id,
    session?.id,
  );
  const restorePositionKey = feedRestorePositionKey(
    location.state,
    `${location.pathname}${location.search}`,
  );
  const previousAuthScopeKeyRef = useRef(authScopeKey);
  const {
    begin: beginLoad,
    isCurrent: isLoadCurrent,
    finish: finishLoad,
  } = useAsyncAuthorityFence(`pilot-home:${authScopeKey}`);

  const [snapshotState, setSnapshotState] = useState<{
    scopeKey: string;
    snapshot: PilotHomeResponse;
  } | null>(null);
  const snapshot =
    snapshotState?.scopeKey === authScopeKey ? snapshotState.snapshot : null;

  const [viewState, setViewState] = useState<{
    scopeKey: string;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const currentViewState =
    viewState?.scopeKey === authScopeKey ? viewState : null;
  const loading = currentViewState?.loading ?? status === "authenticated";
  const error = currentViewState?.error ?? null;

  useLayoutEffect(() => {
    if (previousAuthScopeKeyRef.current === authScopeKey) return;
    previousAuthScopeKeyRef.current = authScopeKey;
    clearFeedScrollPositions();
    setActiveHomeFeed("contextual");
    setSnapshotState(null);
    setViewState({
      scopeKey: authScopeKey,
      loading: status === "authenticated",
      error: null,
    });
    window.scrollTo(0, 0);
  }, [authScopeKey, status]);

  const load = useCallback(async () => {
    if (status !== "authenticated") return;

    const ticket = beginLoad();
    if (!isLoadCurrent(ticket)) return;
    setViewState({
      scopeKey: authScopeKey,
      loading: true,
      error: null,
    });

    try {
      const result = await pilotApi.home(ticket.signal);
      if (!isLoadCurrent(ticket)) return;
      setSnapshotState({
        scopeKey: authScopeKey,
        snapshot: result,
      });
    } catch (nextError) {
      if (!isLoadCurrent(ticket)) return;
      setViewState({
        scopeKey: authScopeKey,
        loading: false,
        error: isPilotApiError(nextError)
          ? nextError.message
          : "No pudimos preparar tu inicio.",
      });
    } finally {
      if (finishLoad(ticket)) {
        setViewState((current) =>
          current?.scopeKey === authScopeKey
            ? { ...current, loading: false }
            : current,
        );
      }
    }
  }, [authScopeKey, beginLoad, finishLoad, isLoadCurrent, status]);

  useEffect(() => {
    if (status === "authenticated") {
      void load();
    }
  }, [load, status]);

  useLayoutEffect(() => {
    if (
      status !== "authenticated" ||
      loading ||
      !snapshot ||
      !restorePositionKey
    ) {
      return;
    }

    const scrollY = takeFeedScrollPosition(
      restorePositionKey,
      scrollAuthorityScope,
    );
    if (scrollY !== null) window.scrollTo(0, scrollY);
  }, [
    loading,
    location.key,
    restorePositionKey,
    scrollAuthorityScope,
    snapshot,
    status,
  ]);

  if (status === "restoring") {
    return (
      <section className="pilot-page">
        <p role="status">Preparando Los Apuntes…</p>
      </section>
    );
  }

  if (status !== "authenticated") {
    return <Landing />;
  }

  const alumniContinuity =
    snapshot?.academic.currentSubjectIds.length === 0 &&
    (snapshot.lifecycle.phase === "alumni" ||
      snapshot.lifecycle.phase === "mixed");
  const contextualFeedTitle =
    snapshot?.homeFeed.kind === "community"
      ? "Universidad y comunidad"
      : "Mis materias";
  const activeFeedTitle =
    activeHomeFeed === "contextual" ? contextualFeedTitle : "Para vos";

  return (
    <section className="pilot-page" aria-labelledby="pilot-home-title">
      <header className="pilot-hero">
        <div>
          <p className="pilot-eyebrow">Inicio contextual</p>
          <h1 id="pilot-home-title">Qué vale la pena mirar ahora</h1>
          <p>
            Una tanda corta basada en tus materias, tu red y tus preferencias
            actuales.
          </p>
        </div>
        <div className="pilot-hero-stats">
          <span>
            <strong>{snapshot?.academic.currentSubjectIds.length ?? 0}</strong>
            materias actuales
          </span>
          <Link to="/notifications">
            <strong>{snapshot?.notifications.unreadCount ?? 0}</strong>{" "}
            notificaciones sin leer
          </Link>
        </div>
      </header>

      {error && (
        <div className="pilot-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}

      {loading && !snapshot ? (
        <p role="status">Preparando una tanda útil…</p>
      ) : snapshot ? (
        <>
          {!snapshot.profileReady && (
            <section className="pilot-callout">
              <div>
                <strong>Tu perfil todavía está incompleto.</strong>
                <p>
                  Completalo para que tu identidad y tus señales de
                  personalización sean explícitas.
                </p>
              </div>
              <Link to="/profile">Completar perfil</Link>
            </section>
          )}

          {snapshot.academic.currentSubjectIds.length === 0 &&
            !alumniContinuity && (
              <section className="pilot-callout">
                <div>
                  <strong>Falta tu contexto académico actual.</strong>
                  <p>
                    El feed no inventa materias: necesita participaciones
                    académicas reales para contextualizar el inicio.
                  </p>
                </div>
                <Link to="/search">Explorar materias y contenido</Link>
              </section>
            )}

          {alumniContinuity && (
            <section className="pilot-callout">
              <div>
                <strong>Tu etapa cambió, tu comunidad sigue.</strong>
                <p>
                  Conservamos tu historial y priorizamos universidad, carrera,
                  personas y organizaciones que elegiste seguir.
                </p>
              </div>
              <Link to="/academic/lifecycle">Revisar mi trayectoria</Link>
            </section>
          )}

          <section className="pilot-card pilot-create-entry">
            <div>
              <p className="pilot-eyebrow">Participá</p>
              <h2>Aportá a tu comunidad</h2>
              <p>
                Compartí un apunte o abrí una pregunta para que otras personas
                puedan ayudarte.
              </p>
            </div>
            <div className="pilot-actions">
              <Link className="pilot-primary-link" to="/questions">
                Hacer una pregunta
              </Link>
              <Link className="pilot-secondary-link" to="/resources">
                Subir un apunte
              </Link>
            </div>
          </section>

          <div className="pilot-home-feed">
            <div
              className="pilot-feed-intents"
              role="group"
              aria-label="Elegir feed de inicio"
            >
              <button
                type="button"
                aria-pressed={activeHomeFeed === "contextual"}
                onClick={() => setActiveHomeFeed("contextual")}
              >
                {contextualFeedTitle}
              </button>
              <button
                type="button"
                aria-pressed={activeHomeFeed === "for-you"}
                onClick={() => setActiveHomeFeed("for-you")}
              >
                Para vos
              </button>
            </div>
            <FeedPreview
              key={`${authScopeKey}:${activeHomeFeed}`}
              title={activeFeedTitle}
              items={
                activeHomeFeed === "contextual"
                  ? snapshot.homeFeed.items
                  : snapshot.forYou.items
              }
              moreTo={homeFeedHref(activeHomeFeed, snapshot.homeFeed.kind)}
              emptyGuidance={homeFeedEmptyGuidance(
                activeHomeFeed,
                snapshot.homeFeed.kind,
              )}
              homeIntent={activeHomeFeed}
            />
          </div>

          <section className="pilot-card pilot-shortcuts">
            <h2>Explorar tu espacio</h2>
            <div className="pilot-actions">
              <Link to="/academic/lifecycle">Mi trayectoria</Link>
              <Link to="/network">Revisar mi red</Link>
              <Link to="/organizations">Organizaciones</Link>
              <Link to="/search">Buscar en Los Apuntes</Link>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
};

export default Home;
