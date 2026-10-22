import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type { SearchPersonResult } from "../features/search/interfaces";
import {
  isSearchApiError,
  searchApi,
} from "../features/search/services/searchService";
import type {
  ConnectionView,
  FollowingItem,
} from "../features/community/interfaces";
import {
  communityApi,
  isCommunityApiError,
} from "../features/community/services/communityService";
import { NetworkActionGate } from "../features/community/network-action-gate";
import {
  appendUniqueNetworkItems,
  repeatsNetworkCursor,
} from "../features/community/network-pagination.mjs";
import { PublicProfileAvatar } from "../features/profile/public-profile-avatar";
import {
  groupNetworkConnections,
  networkConnectionStatusLabel,
} from "../features/community/network-presentation";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./Community.scss";

function messageFor(error: unknown): string {
  if (isCommunityApiError(error) || isSearchApiError(error)) {
    if (error.code === "EMAIL_VERIFICATION_REQUIRED") {
      return "Verificá tu email antes de crear relaciones sociales.";
    }
    if (error.code === "SOCIAL_SELF_RELATION_INVALID") {
      return "No podés seguirte ni conectarte con vos mismo.";
    }
    return error.message;
  }
  return "No pudimos completar la operación.";
}

function createCursorHistory(scopeKey: string) {
  return {
    scopeKey,
    following: new Set<string>(),
    connections: new Set<string>(),
  };
}

const repeatedCursorMessage =
  "La red devolvió una página repetida. Detuvimos esa lista para evitar repetir resultados.";

type NetworkAction = (
  key: string,
  action: (signal: AbortSignal) => Promise<unknown>,
  success: string,
) => Promise<void>;

function ConnectionRow({
  connection,
  busy,
  onAction,
}: {
  connection: ConnectionView;
  busy: string | null;
  onAction: NetworkAction;
}) {
  return (
    <li>
      <div className="network-person-summary">
        <PublicProfileAvatar
          avatarUrl={connection.other.avatarUrl}
          displayName={connection.other.displayName}
          size="small"
        />
        <div>
          <Link
            className="network-person-name"
            to={`/p/${encodeURIComponent(connection.other.profileId)}`}
          >
            {connection.other.displayName}
          </Link>
          <span className="community-status">
            {networkConnectionStatusLabel(connection)}
          </span>
        </div>
      </div>
      <div className="community-actions">
        {connection.incoming && connection.status === "pending" && (
          <>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void onAction(
                  `accept:${connection.id}`,
                  (signal) =>
                    communityApi.respondConnection(
                      connection.id,
                      "accept",
                      signal,
                    ),
                  "Conexión aceptada.",
                )
              }
            >
              Aceptar
            </button>
            <button
              type="button"
              className="secondary"
              disabled={Boolean(busy)}
              onClick={() =>
                void onAction(
                  `decline:${connection.id}`,
                  (signal) =>
                    communityApi.respondConnection(
                      connection.id,
                      "decline",
                      signal,
                    ),
                  "Solicitud rechazada.",
                )
              }
            >
              Rechazar
            </button>
          </>
        )}
        {connection.status === "accepted" && (
          <button
            type="button"
            className="secondary"
            disabled={Boolean(busy)}
            onClick={() =>
              void onAction(
                `disconnect:${connection.id}`,
                (signal) => communityApi.disconnect(connection.id, signal),
                "Conexión finalizada.",
              )
            }
          >
            Desconectar
          </button>
        )}
      </div>
    </li>
  );
}

const Network = () => {
  const { status, user, session } = useAuth();
  const authScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const cursorHistoryRef = useRef(createCursorHistory(authScopeKey));
  // This lock is synchronous, so rapid clicks cannot race React's busy state.
  const actionGateRef = useRef(new NetworkActionGate());
  const {
    begin: beginLoad,
    isCurrent: isLoadCurrent,
    finish: finishLoad,
  } = useAsyncAuthorityFence(`network-load:${authScopeKey}`);
  const {
    begin: beginAction,
    isCurrent: isActionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(`network-action:${authScopeKey}`);

  const [query, setQuery] = useState("");
  const searchScopeKey = [authScopeKey, query.trim()].join(":");
  const {
    begin: beginSearch,
    isCurrent: isSearchCurrent,
    finish: finishSearch,
  } = useAsyncAuthorityFence(`network-search:${searchScopeKey}`);

  const [snapshotState, setSnapshotState] = useState<{
    scopeKey: string;
    following: FollowingItem[];
    followingNextCursor: string | null;
    connections: ConnectionView[];
    connectionsNextCursor: string | null;
  } | null>(null);
  const snapshot =
    snapshotState?.scopeKey === authScopeKey ? snapshotState : null;
  const following = snapshot?.following ?? [];
  const followingNextCursor = snapshot?.followingNextCursor ?? null;
  const connections = snapshot?.connections ?? [];
  const connectionsNextCursor = snapshot?.connectionsNextCursor ?? null;
  const connectionGroups = groupNetworkConnections(connections);

  const [searchState, setSearchState] = useState<{
    scopeKey: string;
    busy: boolean;
    error: string | null;
    people: SearchPersonResult[];
  } | null>(null);
  const currentSearchState =
    searchState?.scopeKey === searchScopeKey ? searchState : null;
  const people = currentSearchState?.people ?? [];

  const [loadState, setLoadState] = useState<{
    scopeKey: string;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const currentLoadState =
    loadState?.scopeKey === authScopeKey ? loadState : null;
  const loading = currentLoadState?.loading ?? true;

  const [actionState, setActionState] = useState<{
    scopeKey: string;
    busy: string | null;
    error: string | null;
    feedback: string | null;
  } | null>(null);
  const currentActionState =
    actionState?.scopeKey === authScopeKey ? actionState : null;
  const busy =
    currentActionState?.busy ?? (currentSearchState?.busy ? "search" : null);
  const error =
    currentActionState?.error ??
    currentSearchState?.error ??
    currentLoadState?.error ??
    null;
  const feedback = currentActionState?.feedback ?? null;

  const load = useCallback(async () => {
    const ticket = beginLoad();
    if (!isLoadCurrent(ticket)) return;
    setLoadState({ scopeKey: authScopeKey, loading: true, error: null });

    try {
      const [followingResult, connectionResult] = await Promise.all([
        communityApi.following(50, undefined, ticket.signal),
        communityApi.connections(undefined, 50, undefined, ticket.signal),
      ]);
      if (!isLoadCurrent(ticket)) return;
      if (cursorHistoryRef.current.scopeKey === authScopeKey) {
        cursorHistoryRef.current.following.clear();
        cursorHistoryRef.current.connections.clear();
      } else {
        cursorHistoryRef.current = createCursorHistory(authScopeKey);
      }
      setSnapshotState({
        scopeKey: authScopeKey,
        following: followingResult.items,
        followingNextCursor: followingResult.nextCursor,
        connections: connectionResult.items,
        connectionsNextCursor: connectionResult.nextCursor,
      });
    } catch (nextError) {
      if (!isLoadCurrent(ticket)) return;
      setLoadState({
        scopeKey: authScopeKey,
        loading: false,
        error: messageFor(nextError),
      });
    } finally {
      if (finishLoad(ticket)) {
        setLoadState((current) =>
          current?.scopeKey === authScopeKey
            ? { ...current, loading: false }
            : current,
        );
      }
    }
  }, [authScopeKey, beginLoad, finishLoad, isLoadCurrent]);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setQuery("");
    setSearchState(null);
    setActionState(null);
  }, [authScopeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMoreFollowing = async () => {
    if (!followingNextCursor) return;
    const cursor = followingNextCursor;
    const history = cursorHistoryRef.current;
    if (history.scopeKey !== authScopeKey) return;
    if (history.following.has(cursor)) {
      setSnapshotState((current) =>
        current?.scopeKey === authScopeKey
          ? { ...current, followingNextCursor: null }
          : current,
      );
      setActionState({
        scopeKey: authScopeKey,
        busy: null,
        error: repeatedCursorMessage,
        feedback: null,
      });
      return;
    }
    const lease = actionGateRef.current.tryAcquire(
      authScopeKey,
      "following-more",
    );
    if (!lease) return;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) {
      actionGateRef.current.release(lease);
      return;
    }
    setActionState({
      scopeKey: authScopeKey,
      busy: "following-more",
      error: null,
      feedback: null,
    });

    try {
      const result = await communityApi.following(50, cursor, ticket.signal);
      if (!isActionCurrent(ticket)) return;
      const repeatedCursor = repeatsNetworkCursor(
        history.following,
        cursor,
        result.nextCursor,
      );
      history.following.add(cursor);
      setSnapshotState((current) =>
        current?.scopeKey === authScopeKey
          ? {
              ...current,
              following: appendUniqueNetworkItems(
                current.following,
                result.items,
                (item) => item.profile.profileId,
              ),
              followingNextCursor: repeatedCursor ? null : result.nextCursor,
            }
          : current,
      );
      if (repeatedCursor) {
        setActionState({
          scopeKey: authScopeKey,
          busy: "following-more",
          error: repeatedCursorMessage,
          feedback: null,
        });
      }
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: "following-more",
        error: messageFor(nextError),
        feedback: null,
      });
    } finally {
      actionGateRef.current.release(lease);
      if (finishAction(ticket)) {
        setActionState((current) =>
          current?.scopeKey === authScopeKey
            ? { ...current, busy: null }
            : current,
        );
      }
    }
  };

  const loadMoreConnections = async () => {
    if (!connectionsNextCursor) return;
    const cursor = connectionsNextCursor;
    const history = cursorHistoryRef.current;
    if (history.scopeKey !== authScopeKey) return;
    if (history.connections.has(cursor)) {
      setSnapshotState((current) =>
        current?.scopeKey === authScopeKey
          ? { ...current, connectionsNextCursor: null }
          : current,
      );
      setActionState({
        scopeKey: authScopeKey,
        busy: null,
        error: repeatedCursorMessage,
        feedback: null,
      });
      return;
    }
    const lease = actionGateRef.current.tryAcquire(
      authScopeKey,
      "connections-more",
    );
    if (!lease) return;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) {
      actionGateRef.current.release(lease);
      return;
    }
    setActionState({
      scopeKey: authScopeKey,
      busy: "connections-more",
      error: null,
      feedback: null,
    });

    try {
      const result = await communityApi.connections(
        undefined,
        50,
        cursor,
        ticket.signal,
      );
      if (!isActionCurrent(ticket)) return;
      const repeatedCursor = repeatsNetworkCursor(
        history.connections,
        cursor,
        result.nextCursor,
      );
      history.connections.add(cursor);
      setSnapshotState((current) =>
        current?.scopeKey === authScopeKey
          ? {
              ...current,
              connections: appendUniqueNetworkItems(
                current.connections,
                result.items,
                (item) => item.id,
              ),
              connectionsNextCursor: repeatedCursor ? null : result.nextCursor,
            }
          : current,
      );
      if (repeatedCursor) {
        setActionState({
          scopeKey: authScopeKey,
          busy: "connections-more",
          error: repeatedCursorMessage,
          feedback: null,
        });
      }
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: "connections-more",
        error: messageFor(nextError),
        feedback: null,
      });
    } finally {
      actionGateRef.current.release(lease);
      if (finishAction(ticket)) {
        setActionState((current) =>
          current?.scopeKey === authScopeKey
            ? { ...current, busy: null }
            : current,
        );
      }
    }
  };

  const findPeople = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;

    const ticket = beginSearch();
    if (!isSearchCurrent(ticket)) return;
    setSearchState({
      scopeKey: searchScopeKey,
      busy: true,
      error: null,
      people: currentSearchState?.people ?? [],
    });
    try {
      const result = await searchApi.search(
        {
          q,
          scope: "people",
          limit: 12,
        },
        ticket.signal,
      );
      if (!isSearchCurrent(ticket)) return;
      setSearchState({
        scopeKey: searchScopeKey,
        busy: false,
        error: null,
        people: result.results.people,
      });
    } catch (nextError) {
      if (!isSearchCurrent(ticket)) return;
      setSearchState({
        scopeKey: searchScopeKey,
        busy: false,
        error: messageFor(nextError),
        people: [],
      });
    } finally {
      if (finishSearch(ticket)) {
        setSearchState((current) =>
          current?.scopeKey === searchScopeKey
            ? { ...current, busy: false }
            : current,
        );
      }
    }
  };

  const run = async (
    key: string,
    action: (signal: AbortSignal) => Promise<unknown>,
    success: string,
  ) => {
    const lease = actionGateRef.current.tryAcquire(authScopeKey, key);
    if (!lease) return;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) {
      actionGateRef.current.release(lease);
      return;
    }
    setActionState({
      scopeKey: authScopeKey,
      busy: key,
      error: null,
      feedback: null,
    });
    try {
      await action(ticket.signal);
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: key,
        error: null,
        feedback: success,
      });
      await loadRef.current();
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: key,
        error: messageFor(nextError),
        feedback: null,
      });
    } finally {
      actionGateRef.current.release(lease);
      if (finishAction(ticket)) {
        setActionState((current) =>
          current?.scopeKey === authScopeKey
            ? { ...current, busy: null }
            : current,
        );
      }
    }
  };

  return (
    <section className="community-page" aria-labelledby="network-title">
      <header className="community-hero">
        <p className="community-eyebrow">Red</p>
        <h1 id="network-title">Conexiones explícitas, no inferidas</h1>
        <p>
          Compartir universidad o materia no crea una relación. Seguir expresa
          interés; una conexión necesita consentimiento de ambas personas.
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

      <section className="community-card">
        <h2>Buscar personas</h2>
        <form className="community-search" onSubmit={findPeople}>
          <input
            required
            minLength={2}
            maxLength={120}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre público"
            aria-label="Buscar personas"
          />
          <button type="submit" disabled={busy === "search"}>
            {busy === "search" ? "Buscando…" : "Buscar"}
          </button>
        </form>

        {people.length > 0 && (
          <ul className="community-list">
            {people.map((person) => (
              <li key={person.profileId}>
                <div className="network-person-summary">
                  <PublicProfileAvatar
                    avatarUrl={person.avatarUrl}
                    displayName={person.displayName}
                    size="small"
                  />
                  <div>
                    <strong>{person.displayName}</strong>
                    <Link to={`/p/${person.profileId}`}>Ver perfil</Link>
                  </div>
                </div>
                <div className="community-actions">
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void run(
                        `follow:${person.profileId}`,
                        (signal) =>
                          communityApi.follow(person.profileId, signal),
                        "Ahora seguís ese perfil.",
                      )
                    }
                  >
                    Seguir
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void run(
                        `connect:${person.profileId}`,
                        (signal) =>
                          communityApi.requestConnection(
                            person.profileId,
                            signal,
                          ),
                        "Solicitud de conexión enviada.",
                      )
                    }
                  >
                    Conectar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {currentSearchState &&
          !currentSearchState.busy &&
          !currentSearchState.error &&
          people.length === 0 && (
            <p className="community-note" role="status">
              No encontramos perfiles públicos que coincidan con tu búsqueda.
              Probá otro nombre.
            </p>
          )}
      </section>

      <div className="community-grid">
        <section className="community-card">
          <h2>Siguiendo</h2>
          {loading ? (
            <p>Cargando…</p>
          ) : following.length === 0 ? (
            <p>Todavía no seguís perfiles.</p>
          ) : (
            <>
              <ul className="community-list">
                {following.map((item) => (
                  <li key={item.profile.profileId}>
                    <div className="network-person-summary">
                      <PublicProfileAvatar
                        avatarUrl={item.profile.avatarUrl}
                        displayName={item.profile.displayName}
                        size="small"
                      />
                      <div>
                        <strong>{item.profile.displayName}</strong>
                        <Link to={`/p/${item.profile.profileId}`}>Perfil</Link>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void run(
                          `unfollow:${item.profile.profileId}`,
                          (signal) =>
                            communityApi.unfollow(
                              item.profile.profileId,
                              signal,
                            ),
                          "Dejaste de seguir ese perfil.",
                        )
                      }
                    >
                      Dejar de seguir
                    </button>
                  </li>
                ))}
              </ul>
              {followingNextCursor && (
                <button
                  type="button"
                  className="secondary"
                  disabled={Boolean(busy)}
                  onClick={() => void loadMoreFollowing()}
                >
                  {busy === "following-more" ? "Cargando…" : "Cargar más"}
                </button>
              )}
            </>
          )}
        </section>

        <section className="community-card network-relationships">
          <h2>Conexiones y solicitudes</h2>
          <p className="network-section-description">
            Las conexiones requieren aceptación; seguir a alguien no crea una
            conexión.
          </p>
          {loading ? (
            <p role="status">Cargando relaciones…</p>
          ) : connections.length === 0 ? (
            <p>
              No hay solicitudes ni conexiones todavía. Buscá personas para
              empezar.
            </p>
          ) : (
            <>
              {connectionGroups.incomingRequests.length > 0 && (
                <section
                  className="network-requests"
                  aria-labelledby="network-incoming-title"
                >
                  <h3 id="network-incoming-title">
                    Solicitudes para responder
                    <span className="network-request-count">
                      {connectionGroups.incomingRequests.length}
                    </span>
                  </h3>
                  <ul className="community-list">
                    {connectionGroups.incomingRequests.map((connection) => (
                      <ConnectionRow
                        key={connection.id}
                        connection={connection}
                        busy={busy}
                        onAction={run}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {connectionGroups.otherRelationships.length > 0 && (
                <section aria-labelledby="network-other-title">
                  <h3 id="network-other-title">
                    Tu red y solicitudes enviadas
                  </h3>
                  <ul className="community-list">
                    {connectionGroups.otherRelationships.map((connection) => (
                      <ConnectionRow
                        key={connection.id}
                        connection={connection}
                        busy={busy}
                        onAction={run}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {connectionsNextCursor && (
                <button
                  type="button"
                  className="secondary"
                  disabled={Boolean(busy)}
                  onClick={() => void loadMoreConnections()}
                >
                  {busy === "connections-more"
                    ? "Cargando…"
                    : "Ver más relaciones"}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
};

export default Network;
