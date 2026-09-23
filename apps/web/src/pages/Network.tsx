import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
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

const Network = () => {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<SearchPersonResult[]>([]);
  const [following, setFollowing] = useState<FollowingItem[]>([]);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [followingResult, connectionResult] = await Promise.all([
        communityApi.following(),
        communityApi.connections(),
      ]);
      setFollowing(followingResult.items);
      setConnections(connectionResult.items);
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const findPeople = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;

    setBusy("search");
    setError(null);
    try {
      const result = await searchApi.search({
        q,
        scope: "people",
        limit: 12,
      });
      setPeople(result.results.people);
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  const run = async (
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ) => {
    setBusy(key);
    setError(null);
    setFeedback(null);
    try {
      await action();
      setFeedback(success);
      await load();
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
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

      {feedback && <p className="community-success" role="status">{feedback}</p>}
      {error && <p className="community-error" role="alert">{error}</p>}

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
                <div>
                  <strong>{person.displayName}</strong>
                  <Link to={`/p/${person.profileId}`}>Ver perfil</Link>
                </div>
                <div className="community-actions">
                  <button
                    type="button"
                    disabled={busy === `follow:${person.profileId}`}
                    onClick={() =>
                      void run(
                        `follow:${person.profileId}`,
                        () => communityApi.follow(person.profileId),
                        "Ahora seguís ese perfil.",
                      )
                    }
                  >
                    Seguir
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy === `connect:${person.profileId}`}
                    onClick={() =>
                      void run(
                        `connect:${person.profileId}`,
                        () => communityApi.requestConnection(person.profileId),
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
      </section>

      <div className="community-grid">
        <section className="community-card">
          <h2>Siguiendo</h2>
          {loading ? (
            <p>Cargando…</p>
          ) : following.length === 0 ? (
            <p>Todavía no seguís perfiles.</p>
          ) : (
            <ul className="community-list">
              {following.map((item) => (
                <li key={item.profile.profileId}>
                  <div>
                    <strong>{item.profile.displayName}</strong>
                    <Link to={`/p/${item.profile.profileId}`}>Perfil</Link>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy === `unfollow:${item.profile.profileId}`}
                    onClick={() =>
                      void run(
                        `unfollow:${item.profile.profileId}`,
                        () => communityApi.unfollow(item.profile.profileId),
                        "Dejaste de seguir ese perfil.",
                      )
                    }
                  >
                    Dejar de seguir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="community-card">
          <h2>Conexiones</h2>
          {loading ? (
            <p>Cargando…</p>
          ) : connections.length === 0 ? (
            <p>No hay solicitudes ni conexiones todavía.</p>
          ) : (
            <ul className="community-list">
              {connections.map((connection) => (
                <li key={connection.id}>
                  <div>
                    <strong>{connection.other.displayName}</strong>
                    <span className="community-status">{connection.status}</span>
                    {connection.status === "pending" && (
                      <small>
                        {connection.incoming
                          ? "Solicitud recibida"
                          : "Solicitud enviada"}
                      </small>
                    )}
                  </div>
                  <div className="community-actions">
                    {connection.incoming && connection.status === "pending" && (
                      <>
                        <button
                          type="button"
                          disabled={busy === `accept:${connection.id}`}
                          onClick={() =>
                            void run(
                              `accept:${connection.id}`,
                              () =>
                                communityApi.respondConnection(
                                  connection.id,
                                  "accept",
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
                          disabled={busy === `decline:${connection.id}`}
                          onClick={() =>
                            void run(
                              `decline:${connection.id}`,
                              () =>
                                communityApi.respondConnection(
                                  connection.id,
                                  "decline",
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
                        disabled={busy === `disconnect:${connection.id}`}
                        onClick={() =>
                          void run(
                            `disconnect:${connection.id}`,
                            () => communityApi.disconnect(connection.id),
                            "Conexión finalizada.",
                          )
                        }
                      >
                        Desconectar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
};

export default Network;
