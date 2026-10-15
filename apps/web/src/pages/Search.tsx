import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { AuthorProfileLink } from "../features/profile/AuthorProfileLink";
import { SearchQuickSaveAction } from "../features/search/SearchQuickSaveAction";
import {
  searchSelectionFromSearchParams,
  searchSelectionHref,
  searchSelectionKey,
} from "../features/search/search-navigation.mjs";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
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
  const { status, user, session } = useAuth();
  const authenticated = status === "authenticated";
  const [searchParams, setSearchParams] = useSearchParams();
  const submitted = searchSelectionFromSearchParams(searchParams);
  const submittedKey = searchSelectionKey(submitted);
  const submittedQuery = submitted?.q ?? "";
  const submittedScope = submitted?.scope ?? "all";
  const submittedSubjectId = submitted?.subjectId ?? "";
  const invalidLinkedSearch = searchParams.has("q") && submittedKey === null;
  const authorityScope = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const {
    begin: beginContextRequest,
    isCurrent: isContextRequestCurrent,
    finish: finishContextRequest,
    invalidate: invalidateContextRequest,
  } = useAsyncAuthorityFence(`search-context:${authorityScope}`);
  const {
    begin: beginSearchRequest,
    isCurrent: isSearchRequestCurrent,
    finish: finishSearchRequest,
    invalidate: invalidateSearchRequest,
  } = useAsyncAuthorityFence(
    `search:${authorityScope}:${submittedKey ?? "none"}`,
  );
  const [query, setQuery] = useState(submittedQuery);
  const [scope, setScope] = useState<SearchScope>(submittedScope);
  const [subjectId, setSubjectId] = useState(submittedSubjectId);
  const [retryCount, setRetryCount] = useState(0);
  const resultScopeKey = JSON.stringify([authorityScope, submittedKey]);
  const [searchState, setSearchState] = useState<{
    scopeKey: string;
    result: SearchResponse | null;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const currentSearchState =
    searchState?.scopeKey === resultScopeKey ? searchState : null;
  const result = currentSearchState?.result ?? null;
  const loading = currentSearchState?.loading ?? Boolean(submittedKey);
  const error = currentSearchState?.error ?? null;
  const [copyStatus, setCopyStatus] = useState<{
    scopeKey: string;
    message: string;
  } | null>(null);
  const [contextState, setContextState] = useState<{
    scopeKey: string;
    data: ContextualDiscoveryResponse;
  } | null>(null);
  const contextual =
    contextState?.scopeKey === authorityScope ? contextState.data : null;
  const [contextLoading, setContextLoading] = useState(false);

  // Back/forward navigation updates the draft; editing alone never writes a URL.
  useEffect(() => {
    setQuery(submittedQuery);
    setScope(submittedScope);
    setSubjectId(submittedSubjectId);
  }, [submittedQuery, submittedScope, submittedSubjectId]);

  useEffect(() => {
    if (!authenticated) {
      invalidateContextRequest();
      setContextState(null);
      setContextLoading(false);
      return;
    }

    const ticket = beginContextRequest();
    setContextLoading(true);

    void searchApi
      .contextual({}, ticket.signal)
      .then((value) => {
        if (isContextRequestCurrent(ticket)) {
          setContextState({ scopeKey: authorityScope, data: value });
        }
      })
      .catch(() => {
        if (isContextRequestCurrent(ticket)) setContextState(null);
      })
      .finally(() => {
        if (finishContextRequest(ticket)) setContextLoading(false);
      });

    return () => {
      invalidateContextRequest();
    };
  }, [
    authenticated,
    authorityScope,
    beginContextRequest,
    finishContextRequest,
    invalidateContextRequest,
    isContextRequestCurrent,
  ]);

  // The committed URL is the source of truth for public search results.
  // The async authority fence prevents stale results from another session
  // or an earlier URL from appearing after navigation.
  useEffect(() => {
    if (!submittedKey) {
      invalidateSearchRequest();
      setSearchState(null);
      return;
    }

    const ticket = beginSearchRequest();
    setSearchState({
      scopeKey: resultScopeKey,
      result: null,
      loading: true,
      error: null,
    });

    void searchApi
      .search(
        {
          q: submittedQuery,
          scope: submittedScope,
          subjectId: submittedSubjectId || undefined,
        },
        ticket.signal,
      )
      .then((nextResult) => {
        if (!isSearchRequestCurrent(ticket)) return;
        setSearchState({
          scopeKey: resultScopeKey,
          result: nextResult,
          loading: false,
          error: null,
        });
      })
      .catch((nextError) => {
        if (!isSearchRequestCurrent(ticket)) return;
        setSearchState({
          scopeKey: resultScopeKey,
          result: null,
          loading: false,
          error: messageFor(nextError),
        });
      })
      .finally(() => {
        finishSearchRequest(ticket);
      });

    return () => {
      invalidateSearchRequest();
    };
  }, [
    beginSearchRequest,
    finishSearchRequest,
    invalidateSearchRequest,
    isSearchRequestCurrent,
    resultScopeKey,
    retryCount,
    submittedKey,
    submittedQuery,
    submittedScope,
    submittedSubjectId,
  ]);

  const runSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const href = searchSelectionHref({
      q: query,
      scope,
      subjectId: subjectId || undefined,
    });
    if (!href) return;

    const nextParams = new URLSearchParams(href.slice("/search?".length));
    const nextKey = searchSelectionKey(
      searchSelectionFromSearchParams(nextParams),
    );
    if (nextKey === submittedKey) {
      setRetryCount((current) => current + 1);
    } else {
      // Each submitted search is navigable with the browser back button.
      setSearchParams(nextParams);
    }
  };

  const copySearchLink = async () => {
    const href = searchSelectionHref({
      q: submittedQuery,
      scope: submittedScope,
      subjectId: submittedSubjectId || undefined,
    });
    if (!href) return;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(
        new URL(href, window.location.origin).toString(),
      );
      setCopyStatus({
        scopeKey: resultScopeKey,
        message: "Enlace copiado. Solo incluye la búsqueda y el filtro.",
      });
    } catch {
      setCopyStatus({
        scopeKey: resultScopeKey,
        message:
          "No pudimos copiar el enlace. Podés copiarlo desde la barra del navegador.",
      });
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
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Ej. Base de Datos, Ana, resumen de SQL"
          />
        </label>
        <label>
          Alcance
          <select
            value={scope}
            onChange={(event) => {
              const nextScope = event.target.value as SearchScope;
              setScope(nextScope);
              if (nextScope !== "all" && nextScope !== "resources") {
                setSubjectId("");
              }
            }}
          >
            <option value="all">Todo</option>
            <option value="resources">Apuntes</option>
            <option value="subjects">Materias</option>
            <option value="people">Personas</option>
          </select>
        </label>
        {(scope === "all" || scope === "resources") &&
          (authenticated || Boolean(subjectId)) && (
            <label>
              Materia (solo apuntes)
              <select
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
              >
                <option value="">Todas las materias</option>
                {subjectId &&
                  !contextual?.subjects.some(
                    (bucket) => bucket.subject.id === subjectId,
                  ) && <option value={subjectId}>Materia del enlace</option>}
                {contextual?.subjects.map((bucket) => (
                  <option key={bucket.subject.id} value={bucket.subject.id}>
                    {bucket.subject.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        <button
          type="submit"
          disabled={query.trim().length < 2 || query.trim().length > 120}
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {invalidLinkedSearch && (
        <p className="search-error" role="alert">
          Este enlace de búsqueda o su filtro de materia no es válido. Revisá
          los filtros y buscá nuevamente.
        </p>
      )}
      {error && (
        <div className="search-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
          >
            Reintentar búsqueda
          </button>
        </div>
      )}
      {loading && submittedKey && (
        <p role="status">Buscando recursos, materias y personas…</p>
      )}

      {submittedKey && (
        <div className="search-share">
          <p>
            Esta búsqueda tiene un enlace propio. Podés retomarla o compartirla
            sin perder el filtro.
          </p>
          <button type="button" onClick={() => void copySearchLink()}>
            Copiar enlace de búsqueda
          </button>
          {copyStatus?.scopeKey === resultScopeKey && (
            <p role="status">{copyStatus.message}</p>
          )}
        </div>
      )}

      {result && (
        <section aria-live="polite" className="search-results">
          <p className="search-summary">
            Resultados para <strong>{result.query}</strong>
            {submittedSubjectId && " · Apuntes filtrados por materia"}
          </p>

          {(submittedScope === "all" || submittedScope === "resources") && (
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
                          <AuthorProfileLink
                            profileId={resource.author?.profileId}
                            displayName={
                              resource.author?.displayName ??
                              "Usuario de Los Apuntes"
                            }
                          />
                        </small>
                      </div>
                      <div className="search-result-actions">
                        <Link
                          to={`/resources/${encodeURIComponent(resource.id)}`}
                          state={{
                            searchReturnTo: searchSelectionHref({
                              q: submittedQuery,
                              scope: submittedScope,
                              subjectId: submittedSubjectId || undefined,
                            }),
                          }}
                        >
                          Ver recurso
                        </Link>
                        {authenticated ? (
                          <SearchQuickSaveAction
                            resourceId={resource.id}
                            resourceTitle={resource.title}
                            authorityScope={authorityScope}
                          />
                        ) : (
                          <Link to="/login">Iniciá sesión para guardar</Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {(submittedScope === "all" || submittedScope === "subjects") && (
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
                      <Link
                        to={`/resources?subjectId=${encodeURIComponent(subject.id)}`}
                      >
                        Ver recursos
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {(submittedScope === "all" || submittedScope === "people") && (
            <section className="search-group">
              <h2>Personas con identidad pública</h2>
              {result.results.people.length === 0 ? (
                <p>No encontramos perfiles públicos.</p>
              ) : (
                <ul>
                  {result.results.people.map((person) => (
                    <li key={person.profileId}>
                      <strong>{person.displayName}</strong>
                      <Link to={`/p/${encodeURIComponent(person.profileId)}`}>
                        Ver perfil
                      </Link>
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
            <p>
              Podés elegir una de estas materias en el filtro de arriba para
              buscar apuntes dentro de esa cursada.
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
                            to={`/resources/${encodeURIComponent(resource.id)}`}
                            state={{
                              searchReturnTo:
                                searchSelectionHref({
                                  q: submittedQuery,
                                  scope: submittedScope,
                                  subjectId: submittedSubjectId || undefined,
                                }) ?? "/search",
                            }}
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
