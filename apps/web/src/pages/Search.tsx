import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  ContextualDiscoveryResponse,
  SearchResponse,
  SearchScope,
} from "../features/search/interfaces";
import {
  isSearchApiError,
  searchApi,
} from "../features/search/services/searchService";
import "./Search.scss";

function messageFor(error: unknown): string {
  if (isSearchApiError(error)) return error.message;
  return "No pudimos completar la búsqueda.";
}

const Search = () => {
  const { status } = useAuth();
  const authenticated = status === "authenticated";
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [contextual, setContextual] =
    useState<ContextualDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) {
      setContextual(null);
      return;
    }

    let active = true;
    setContextLoading(true);

    void searchApi
      .contextual()
      .then((value) => {
        if (active) setContextual(value);
      })
      .catch(() => {
        if (active) setContextual(null);
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authenticated]);

  const runSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;

    setLoading(true);
    setError(null);

    try {
      setResult(await searchApi.search({ q, scope }));
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="search-page">
      <header className="search-hero">
        <p className="search-eyebrow">Búsqueda</p>
        <h1>Encontrá apuntes, materias y personas sin una caja negra</h1>
        <p>
          Los resultados están agrupados por su fuente. No mezclamos tipos con
          un score opaco ni ordenamos por tiempo de pantalla.
        </p>
      </header>

      <form className="search-form" onSubmit={runSearch}>
        <label>
          Buscar
          <input
            required
            minLength={2}
            maxLength={120}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej. Base de Datos, Ana, resumen de SQL"
          />
        </label>
        <label>
          Alcance
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as SearchScope)}
          >
            <option value="all">Todo</option>
            <option value="resources">Apuntes</option>
            <option value="subjects">Materias</option>
            <option value="people">Personas</option>
          </select>
        </label>
        <button type="submit" disabled={loading || query.trim().length < 2}>
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && (
        <p className="search-error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section aria-live="polite" className="search-results">
          <p className="search-summary">
            Resultados para <strong>{result.query}</strong>
          </p>

          {(scope === "all" || scope === "resources") && (
            <section className="search-group">
              <h2>Apuntes y recursos</h2>
              {result.results.resources.length === 0 ? (
                <p>No encontramos recursos visibles.</p>
              ) : (
                <ul>
                  {result.results.resources.map((resource) => (
                    <li key={resource.id}>
                      <div>
                        <strong>{resource.title}</strong>
                        <span>{resource.academic.subject.name}</span>
                        <small>
                          {resource.author?.displayName ??
                            "Usuario de Los Apuntes"}
                        </small>
                      </div>
                      <Link
                        to={`/resources?q=${encodeURIComponent(resource.title)}`}
                      >
                        Ver recurso
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {(scope === "all" || scope === "subjects") && (
            <section className="search-group">
              <h2>Materias</h2>
              {result.results.subjects.length === 0 ? (
                <p>No encontramos materias canónicas.</p>
              ) : (
                <ul>
                  {result.results.subjects.map((subject) => (
                    <li key={subject.id}>
                      <div>
                        <strong>{subject.name}</strong>
                        {subject.aliases.length > 0 && (
                          <small>También: {subject.aliases.join(", ")}</small>
                        )}
                      </div>
                      <Link to={`/resources?subjectId=${subject.id}`}>
                        Ver recursos
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {(scope === "all" || scope === "people") && (
            <section className="search-group">
              <h2>Personas con identidad pública</h2>
              {result.results.people.length === 0 ? (
                <p>No encontramos perfiles públicos.</p>
              ) : (
                <ul>
                  {result.results.people.map((person) => (
                    <li key={person.profileId}>
                      <strong>{person.displayName}</strong>
                      <Link to={`/p/${person.profileId}`}>Ver perfil</Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </section>
      )}

      {authenticated && (
        <section className="search-contextual">
          <div>
            <p className="search-eyebrow">Tu contexto actual</p>
            <h2>Recursos recientes por materia que cursás</h2>
            <p>
              Esta sección usa únicamente materias marcadas como actuales y
              recencia. No es un feed personalizado.
            </p>
          </div>

          {contextLoading ? (
            <p>Cargando contexto…</p>
          ) : !contextual || contextual.subjects.length === 0 ? (
            <p>
              Todavía no hay materias actuales para usar como contexto de
              descubrimiento.
            </p>
          ) : (
            <div className="context-buckets">
              {contextual.subjects.map((bucket) => (
                <article key={bucket.subject.id}>
                  <h3>{bucket.subject.name}</h3>
                  {bucket.resources.length === 0 ? (
                    <p>Sin recursos visibles todavía.</p>
                  ) : (
                    <ul>
                      {bucket.resources.map((resource) => (
                        <li key={resource.id}>
                          <Link
                            to={`/resources?q=${encodeURIComponent(
                              resource.title,
                            )}`}
                          >
                            {resource.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
};

export default Search;
