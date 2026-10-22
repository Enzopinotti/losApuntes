import { useEffect, useState } from "react";

import type { AcademicSubjectOption } from "../resources/interfaces";
import { resourcesApi } from "../resources/services/resourcesService";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";

type SubjectSearchState = {
  key: string;
  busy: boolean;
  options: AcademicSubjectOption[];
  error: string | null;
};

export function QuestionDiscoverySubjectPicker({
  subjectId,
  selectedName,
  onSelect,
  authorityScope,
}: {
  subjectId: string;
  selectedName: string | null;
  onSelect: (subject: AcademicSubjectOption | null) => void;
  authorityScope: string;
}) {
  const [query, setQuery] = useState("");
  const key = `qa-subject-discovery:${authorityScope}:${query.trim()}`;
  const { begin, isCurrent, finish, invalidate } = useAsyncAuthorityFence(key);
  const [searchState, setSearchState] = useState<SubjectSearchState | null>(
    null,
  );
  const state = searchState?.key === key ? searchState : null;

  useEffect(() => {
    // Do not carry a previous account's academic search into a new session.
    setQuery("");
    setSearchState(null);
  }, [authorityScope]);

  const search = async () => {
    const q = query.trim();
    if (q.length < 2 || q.length > 100) return;

    const ticket = begin();
    setSearchState({ key, busy: true, options: [], error: null });
    try {
      const options = await resourcesApi.searchSubjects(q, ticket.signal);
      if (isCurrent(ticket)) {
        setSearchState({ key, busy: false, options, error: null });
      }
    } catch {
      if (isCurrent(ticket)) {
        setSearchState({
          key,
          busy: false,
          options: [],
          error: "No pudimos buscar materias. Reintentá.",
        });
      }
    } finally {
      finish(ticket);
    }
  };

  return (
    <div className="community-question-subject-picker">
      <p className="community-note">
        {subjectId
          ? `Filtro activo: ${selectedName ?? "materia del enlace"}`
          : "Todas las materias"}
      </p>
      {subjectId && (
        <button
          className="secondary"
          type="button"
          onClick={() => {
            invalidate();
            onSelect(null);
          }}
        >
          Quitar filtro de materia
        </button>
      )}
      <label htmlFor="question-discovery-subject-query">
        Buscar una materia para filtrar preguntas
      </label>
      <div className="community-inline">
        <input
          id="question-discovery-subject-query"
          value={query}
          maxLength={100}
          placeholder="Ej.: Álgebra"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          disabled={query.trim().length < 2 || state?.busy === true}
          onClick={() => void search()}
        >
          {state?.busy ? "Buscando…" : "Buscar materias"}
        </button>
      </div>
      {state?.error && (
        <p role="alert" className="community-error">
          {state.error}
        </p>
      )}
      {state && !state.busy && !state.error && state.options.length === 0 && (
        <p role="status">No se encontraron materias para esa búsqueda.</p>
      )}
      {state && state.options.length > 0 && (
        <ul
          className="community-list compact"
          aria-label="Materias encontradas"
        >
          {state.options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => {
                  invalidate();
                  onSelect(option);
                  setSearchState(null);
                }}
              >
                Filtrar por {option.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
