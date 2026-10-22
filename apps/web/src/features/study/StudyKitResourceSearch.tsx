import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import type { ResourceView } from "../resources/interfaces";
import {
  isResourcesApiError,
  resourcesApi,
} from "../resources/services/resourcesService";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";
import {
  normalizeStudyKitResourceQuery,
  studyKitResourceSearchScope,
  STUDY_KIT_RESOURCE_QUERY_MAX,
} from "./study-kit-resource-query.mjs";

type SearchPage = {
  scope: string;
  items: ResourceView[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

type Props = {
  subjectId: string;
  authorityScope: string;
  resourceIds: string[];
  limitReached: boolean;
  onAdd: (resourceId: string) => void;
};

function searchError(error: unknown): string {
  if (isResourcesApiError(error)) {
    if (error.status === 401) {
      return "Tu sesión venció. Volvé a iniciar sesión.";
    }
    if (error.status === 403 || error.status === 404) {
      return "La materia o el material ya no están disponibles.";
    }
  }
  return "No pudimos consultar los apuntes. Podés reintentar la búsqueda.";
}

export function StudyKitResourceSearch({
  subjectId,
  authorityScope,
  resourceIds,
  limitReached,
  onAdd,
}: Props) {
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const scope = submitted
    ? studyKitResourceSearchScope(authorityScope, subjectId, submitted)
    : null;
  const {
    begin: beginSearch,
    isCurrent: isSearchCurrent,
    finish: finishSearch,
  } = useAsyncAuthorityFence(`study-kit-resource-search:${scope ?? "empty"}`);
  const [pageState, setPageState] = useState<SearchPage | null>(null);
  const page = scope && pageState?.scope === scope ? pageState : null;
  const query = normalizeStudyKitResourceQuery(draft);
  const knownIds = new Set(resourceIds);

  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (!scope || !submitted) return;
      const ticket = beginSearch();
      if (!isSearchCurrent(ticket)) return;
      setPageState((previous) => ({
        scope,
        items: append && previous?.scope === scope ? previous.items : [],
        nextCursor:
          append && previous?.scope === scope ? previous.nextCursor : null,
        loading: true,
        error: null,
      }));
      try {
        const response = await resourcesApi.search(
          { subjectId, q: submitted, cursor },
          ticket.signal,
        );
        if (!isSearchCurrent(ticket)) return;
        // The server owns resource visibility; never display a cross-subject
        // item even if a malformed response includes it.
        const matching = response.items.filter(
          (resource) => resource.academic.subject.id === subjectId,
        );
        setPageState((previous) => ({
          scope,
          items:
            append && previous?.scope === scope
              ? Array.from(
                  new Map(
                    [...previous.items, ...matching].map((resource) => [
                      resource.id,
                      resource,
                    ]),
                  ).values(),
                )
              : matching,
          nextCursor: response.nextCursor,
          loading: false,
          error: null,
        }));
      } catch (error) {
        if (!isSearchCurrent(ticket)) return;
        setPageState((previous) => ({
          scope,
          items: append && previous?.scope === scope ? previous.items : [],
          nextCursor: null,
          loading: false,
          error: searchError(error),
        }));
      } finally {
        finishSearch(ticket);
      }
    },
    [scope, subjectId, submitted, beginSearch, isSearchCurrent, finishSearch],
  );

  useEffect(() => {
    if (scope) void load();
  }, [load, scope]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query) return;
    if (query === submitted) {
      void load();
    } else {
      setSubmitted(query);
    }
  };

  const clear = () => {
    setDraft("");
    setSubmitted(null);
  };

  return (
    <section
      className="study-kits-lookup"
      aria-labelledby="study-kits-lookup-title"
    >
      <h4 id="study-kits-lookup-title">Encontrar un apunte específico</h4>
      <p>
        Buscá en los recursos visibles de esta materia, aunque no aparezcan
        todavía en las páginas cargadas de la biblioteca.
      </p>
      <form onSubmit={submit} className="study-kits-lookup-form">
        <label htmlFor="study-kits-resource-query">
          Título, descripción o etiqueta
        </label>
        <input
          id="study-kits-resource-query"
          type="search"
          value={draft}
          maxLength={STUDY_KIT_RESOURCE_QUERY_MAX}
          placeholder="Ej.: resumen de integrales"
          onChange={(event) => setDraft(event.target.value)}
        />
        {draft.trim() && !query && (
          <p role="alert" className="study-kits-error">
            Escribí entre 2 y 120 caracteres válidos.
          </p>
        )}
        <div className="study-kits-actions">
          <button type="submit" disabled={!query || page?.loading}>
            Buscar apuntes
          </button>
          <button type="button" onClick={clear} disabled={!draft && !submitted}>
            Limpiar búsqueda
          </button>
        </div>
      </form>
      {submitted && <p role="status">Resultados para «{submitted}»</p>}
      {scope && !page && <p role="status">Buscando apuntes…</p>}
      {page?.loading && <p role="status">Buscando apuntes…</p>}
      {page?.error && (
        <div className="study-kits-error" role="alert">
          <p>{page.error}</p>
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {page && !page.loading && !page.error && page.items.length === 0 && (
        <p>
          No encontramos apuntes visibles con esas palabras en esta materia.
        </p>
      )}
      {page && page.items.length > 0 && (
        <ul className="study-kits-discovery">
          {page.items.map((resource) => (
            <li key={resource.id}>
              <Link to={`/resources/${encodeURIComponent(resource.id)}`}>
                {resource.title}
              </Link>
              <button
                type="button"
                disabled={
                  page.loading || limitReached || knownIds.has(resource.id)
                }
                aria-label={`Agregar apunte ${resource.title} al kit`}
                onClick={() => onAdd(resource.id)}
              >
                {knownIds.has(resource.id) ? "Agregado" : "Agregar al kit"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {page?.nextCursor && !page.error && (
        <button
          type="button"
          disabled={page.loading}
          onClick={() => void load(page.nextCursor ?? undefined, true)}
        >
          {page.loading ? "Cargando…" : "Más resultados de búsqueda"}
        </button>
      )}
    </section>
  );
}
