import { useState, type FormEvent } from "react";
import type { AcademicSubjectOption } from "../resources/interfaces";
import { resourcesApi } from "../resources/services/resourcesService";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";

type SubjectFilterProps = {
  viewerScopeKey: string;
  subjectId: string | null | undefined;
  onSelect: (subjectId: string | null) => void;
  onCopy: () => void;
};

export function QuestionSubjectFilter({
  viewerScopeKey,
  subjectId,
  onSelect,
  onCopy,
}: SubjectFilterProps) {
  const [query, setQuery] = useState("");
  const searchScopeKey = `${viewerScopeKey}:${query.trim()}`;
  const { begin, isCurrent, finish } = useAsyncAuthorityFence(
    `qa-discovery-subject-search:${searchScopeKey}`,
  );
  const [result, setResult] = useState<{
    scopeKey: string;
    items: AcademicSubjectOption[];
    busy: boolean;
    error: string | null;
  } | null>(null);
  const [chosen, setChosen] = useState<{
    viewerScopeKey: string;
    id: string;
    name: string;
  } | null>(null);
  const current = result?.scopeKey === searchScopeKey ? result : null;
  const activeName =
    chosen?.viewerScopeKey === viewerScopeKey && chosen.id === subjectId
      ? chosen.name
      : null;

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2 || q.length > 120) return;

    const ticket = begin();
    if (!isCurrent(ticket)) return;
    setResult({ scopeKey: searchScopeKey, items: [], busy: true, error: null });
    try {
      const items = await resourcesApi.searchSubjects(q, ticket.signal);
      if (!isCurrent(ticket)) return;
      setResult({
        scopeKey: searchScopeKey,
        items,
        busy: false,
        error: null,
      });
    } catch {
      if (!isCurrent(ticket)) return;
      setResult({
        scopeKey: searchScopeKey,
        items: [],
        busy: false,
        error: "No pudimos buscar materias. Volvé a intentar.",
      });
    } finally {
      if (finish(ticket)) {
        setResult((previous) =>
          previous?.scopeKey === searchScopeKey
            ? { ...previous, busy: false }
            : previous,
        );
      }
    }
  };

  return (
    <section
      className="community-card community-discovery-filter"
      aria-label="Filtrar preguntas por materia"
    >
      <h2>Encontrá dudas de tu materia</h2>
      <p>
        Buscá una materia del catálogo para ver sus preguntas abiertas y
        resueltas.
      </p>
      {subjectId === undefined ? (
        <p className="community-error" role="alert">
          El enlace de materia no es válido. Elegí una materia o quitá el
          filtro.
        </p>
      ) : subjectId ? (
        <p role="status">
          Viendo preguntas de{" "}
          <strong>{activeName ?? "la materia del enlace"}</strong>.
        </p>
      ) : (
        <p>Se muestran preguntas de todas las materias.</p>
      )}
      <form
        className="community-inline"
        onSubmit={(event) => void search(event)}
      >
        <label
          className="community-filter-label"
          htmlFor="qa-subject-filter-query"
        >
          Buscar materia
        </label>
        <input
          id="qa-subject-filter-query"
          type="search"
          minLength={2}
          maxLength={120}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ej. Análisis Matemático"
        />
        <button
          type="submit"
          disabled={current?.busy || query.trim().length < 2}
        >
          {current?.busy ? "Buscando…" : "Buscar materias"}
        </button>
      </form>
      {current?.error && (
        <p className="community-error" role="alert">
          {current.error}
        </p>
      )}
      {current &&
        !current.busy &&
        !current.error &&
        current.items.length === 0 && (
          <p role="status">No encontramos materias con ese nombre.</p>
        )}
      {current && current.items.length > 0 && (
        <ul className="community-list compact">
          {current.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setChosen({ viewerScopeKey, id: item.id, name: item.name });
                  onSelect(item.id);
                }}
              >
                Ver preguntas de {item.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="community-actions community-discovery-actions">
        {subjectId !== null && (
          <button
            type="button"
            className="secondary"
            onClick={() => onSelect(null)}
          >
            Ver todas las materias
          </button>
        )}
        {typeof subjectId === "string" && (
          <button type="button" className="secondary" onClick={onCopy}>
            Copiar enlace de esta materia
          </button>
        )}
      </div>
    </section>
  );
}
