import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";

import type { QuestionState } from "../community/interfaces";
import {
  communityApi,
  isCommunityApiError,
} from "../community/services/communityService";
import {
  isResourcesApiError,
  resourcesApi,
} from "../resources/services/resourcesService";
import { useAsyncAuthorityFence } from "../../shared/useAsyncAuthorityFence";
import type { StudySessionTask } from "./study-session-plan.mjs";
import {
  STUDY_MATERIAL_SEARCH_DEFAULTS,
  STUDY_MATERIAL_SEARCH_MAX_LENGTH,
  materialTaskMinutes,
  mayAddStudyMaterial,
  normalizeStudyMaterialSearchFilter,
  studyMaterialSearchKey,
  type MaterialSearchFilter,
  type MaterialSearchKind,
} from "./study-plan-material-search.mjs";

type Result = {
  id: string;
  title: string;
  kind: MaterialSearchKind;
};
type Page = {
  scope: string;
  items: Result[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  retryCursor: string | null;
};
type AddFeedback = {
  id: string;
  error: string | null;
  busy: boolean;
};

type Props = {
  authorityScope: string;
  subjectId: string;
  existingKeys: Set<string>;
  taskCount: number;
  minutesRemaining: number;
  maxTasks: number;
  disabled: boolean;
  onAdd: (task: StudySessionTask, title: string) => void;
};

function errorMessage(error: unknown): string {
  if (isCommunityApiError(error) || isResourcesApiError(error)) {
    if (error.status === 401)
      return "La sesión venció. Volvé a iniciar sesión.";
    if (error.status === 403 || error.status === 404) {
      return "Este contenido dejó de estar disponible o accesible.";
    }
  }
  return "No pudimos comprobar el contenido. Revisá la conexión y reintentá.";
}

export function StudyPlanMaterialFinder({
  authorityScope,
  subjectId,
  existingKeys,
  taskCount,
  minutesRemaining,
  maxTasks,
  disabled,
  onAdd,
}: Props) {
  const [draft, setDraft] = useState<MaterialSearchFilter>({
    ...STUDY_MATERIAL_SEARCH_DEFAULTS,
  });
  const [applied, setApplied] = useState<MaterialSearchFilter | null>(null);
  const searchScope = applied
    ? studyMaterialSearchKey(authorityScope, applied)
    : null;
  const {
    begin: beginSearch,
    isCurrent: isSearchCurrent,
    finish: finishSearch,
  } = useAsyncAuthorityFence(
    `study-plan-material-search:${searchScope ?? "empty"}`,
  );
  const {
    begin: beginAdd,
    isCurrent: isAddCurrent,
    finish: finishAdd,
  } = useAsyncAuthorityFence(
    `study-plan-material-add:${searchScope ?? "empty"}`,
  );
  const pendingAdd = useRef(false);
  const [pageState, setPageState] = useState<Page | null>(null);
  const [addFeedback, setAddFeedback] = useState<AddFeedback | null>(null);
  const page =
    searchScope && pageState?.scope === searchScope ? pageState : null;
  const validDraft = normalizeStudyMaterialSearchFilter(draft);
  const addBusy = addFeedback?.busy ?? false;

  const load = useCallback(
    async (cursor?: string) => {
      if (!applied || !searchScope) return;
      const ticket = beginSearch();
      if (!isSearchCurrent(ticket)) return;
      const isMore = Boolean(cursor);
      setPageState((previous) => ({
        scope: searchScope,
        items: isMore && previous?.scope === searchScope ? previous.items : [],
        nextCursor:
          isMore && previous?.scope === searchScope
            ? previous.nextCursor
            : null,
        loading: true,
        error: null,
        retryCursor: null,
      }));
      try {
        const response =
          applied.kind === "resource"
            ? await resourcesApi.search(
                { q: applied.q, subjectId, cursor },
                ticket.signal,
              )
            : await communityApi.questions(
                {
                  q: applied.q,
                  subjectId,
                  status: (applied.status || undefined) as
                    QuestionState | undefined,
                  limit: 15,
                  cursor,
                },
                ticket.signal,
              );
        if (!isSearchCurrent(ticket)) return;
        const matching: Result[] = response.items
          .filter((item) => item.academic.subject.id === subjectId)
          .map((item) => ({
            id: item.id,
            title: item.title,
            kind: applied.kind,
          }));
        setPageState((previous) => ({
          scope: searchScope,
          items:
            isMore && previous?.scope === searchScope
              ? Array.from(
                  new Map(
                    [...previous.items, ...matching].map((item) => [
                      item.id,
                      item,
                    ]),
                  ).values(),
                )
              : matching,
          nextCursor: response.nextCursor,
          loading: false,
          error: null,
          retryCursor: null,
        }));
      } catch (error) {
        if (!isSearchCurrent(ticket)) return;
        setPageState((previous) => ({
          scope: searchScope,
          items:
            isMore && previous?.scope === searchScope ? previous.items : [],
          nextCursor:
            isMore && previous?.scope === searchScope
              ? previous.nextCursor
              : null,
          loading: false,
          error: errorMessage(error),
          retryCursor: cursor ?? null,
        }));
      } finally {
        finishSearch(ticket);
      }
    },
    [
      applied,
      searchScope,
      subjectId,
      beginSearch,
      isSearchCurrent,
      finishSearch,
    ],
  );

  useEffect(() => {
    if (searchScope) void load();
  }, [load, searchScope]);

  const changeDraft = (patch: Partial<MaterialSearchFilter>) => {
    setDraft((old) => ({ ...old, ...patch }));
    setApplied(null);
    setAddFeedback(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeStudyMaterialSearchFilter(draft);
    if (!normalized) return;
    if (studyMaterialSearchKey(authorityScope, normalized) === searchScope) {
      void load();
    } else {
      setApplied(normalized);
    }
  };

  const add = async (item: Result) => {
    if (
      pendingAdd.current ||
      !applied ||
      item.kind !== applied.kind ||
      disabled ||
      !mayAddStudyMaterial(
        item.kind,
        item.id,
        existingKeys,
        taskCount,
        minutesRemaining,
        maxTasks,
      )
    ) {
      return;
    }
    const ticket = beginAdd();
    if (!isAddCurrent(ticket)) return;
    pendingAdd.current = true;
    setAddFeedback({ id: item.id, busy: true, error: null });
    try {
      // Search visibility can expire while the list is open. Reauthorize each
      // item before adding it to a plan that may later be exported.
      const verified =
        item.kind === "resource"
          ? (await resourcesApi.get(item.id, ticket.signal)).resource
          : (await communityApi.question(item.id, ticket.signal)).question;
      if (!isAddCurrent(ticket)) return;
      if (
        verified.id !== item.id ||
        verified.academic.subject.id !== subjectId
      ) {
        throw new Error("STUDY_PLAN_MATERIAL_ACCESS_CHANGED");
      }
      const minutes = materialTaskMinutes(item.kind);
      if (minutes === null) return;
      onAdd(
        { kind: item.kind, id: item.id, minutes, done: false },
        verified.title,
      );
      setAddFeedback(null);
    } catch (error) {
      if (!isAddCurrent(ticket)) return;
      setAddFeedback({
        id: item.id,
        busy: false,
        error:
          error instanceof Error &&
          error.message === "STUDY_PLAN_MATERIAL_ACCESS_CHANGED"
            ? "La materia de este contenido cambió. Actualizá la búsqueda."
            : errorMessage(error),
      });
    } finally {
      pendingAdd.current = false;
      finishAdd(ticket);
    }
  };

  const clear = () => {
    setDraft({ ...STUDY_MATERIAL_SEARCH_DEFAULTS });
    setApplied(null);
    setAddFeedback(null);
  };

  return (
    <section
      className="study-session-material-finder"
      aria-labelledby="study-plan-finder-title"
    >
      <h3 id="study-plan-finder-title">Encontrar material para tu plan</h3>
      <p>
        Buscá un tema dentro de esta materia y agregá un apunte o una pregunta
        sin recorrer todas las páginas. Cada resultado se comprueba otra vez
        antes de sumarlo.
      </p>
      <form className="study-session-material-form" onSubmit={submit}>
        <label>
          Qué querés repasar
          <select
            value={draft.kind}
            onChange={(event) =>
              changeDraft({
                kind: event.target.value as MaterialSearchKind,
                status: "",
              })
            }
          >
            <option value="resource">Apuntes</option>
            <option value="question">Preguntas</option>
          </select>
        </label>
        <label>
          Buscar por tema
          <input
            type="search"
            maxLength={STUDY_MATERIAL_SEARCH_MAX_LENGTH}
            value={draft.q}
            placeholder="Ej.: derivadas"
            onChange={(event) => changeDraft({ q: event.target.value })}
          />
        </label>
        {draft.kind === "question" && (
          <label>
            Estado de las preguntas
            <select
              value={draft.status}
              onChange={(event) =>
                changeDraft({
                  status: event.target.value as MaterialSearchFilter["status"],
                })
              }
            >
              <option value="">Todas</option>
              <option value="open">Abiertas</option>
              <option value="closed">Cerradas</option>
            </select>
          </label>
        )}
        {draft.q.trim() && !validDraft && (
          <p className="study-session-alert" role="alert">
            Escribí entre 2 y 120 caracteres válidos para buscar.
          </p>
        )}
        <div className="study-session-quick-actions">
          <button
            type="submit"
            disabled={!validDraft || Boolean(page?.loading)}
          >
            Buscar material
          </button>
          <button type="button" onClick={clear} disabled={!draft.q && !applied}>
            Limpiar
          </button>
        </div>
      </form>
      {applied && (
        <p className="study-session-info" role="status">
          Resultados de {applied.kind === "resource" ? "apuntes" : "preguntas"}
          {applied.status
            ? ` ${applied.status === "open" ? "abiertas" : "cerradas"}`
            : ""}{" "}
          para «{applied.q}».
        </p>
      )}
      {searchScope && !page && <p role="status">Buscando material…</p>}
      {page?.loading && <p role="status">Buscando material…</p>}
      {page?.error && (
        <div className="study-session-alert" role="alert">
          <p>{page.error}</p>
          <button
            type="button"
            onClick={() => void load(page.retryCursor ?? undefined)}
          >
            Reintentar
          </button>
        </div>
      )}
      {page && !page.loading && !page.error && page.items.length === 0 && (
        <p>No se encontraron materiales visibles con esas palabras.</p>
      )}
      {addFeedback?.error && (
        <p className="study-session-alert" role="alert">
          {addFeedback.error}
        </p>
      )}
      {page && page.items.length > 0 && (
        <ul className="study-session-sources">
          {page.items.map((item) => {
            const canAdd = mayAddStudyMaterial(
              item.kind,
              item.id,
              existingKeys,
              taskCount,
              minutesRemaining,
              maxTasks,
            );
            const alreadyAdded = existingKeys.has(item.kind + ":" + item.id);
            return (
              <li key={item.kind + ":" + item.id}>
                <Link
                  to={
                    item.kind === "resource"
                      ? `/resources/${encodeURIComponent(item.id)}`
                      : `/questions?id=${encodeURIComponent(item.id)}`
                  }
                >
                  {item.title}
                </Link>
                <button
                  type="button"
                  disabled={disabled || addBusy || !canAdd}
                  onClick={() => void add(item)}
                >
                  {alreadyAdded
                    ? "Agregado"
                    : addBusy && addFeedback?.id === item.id
                      ? "Comprobando…"
                      : "Sumar al plan"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {page?.nextCursor && (
        <button
          type="button"
          disabled={page.loading}
          onClick={() => void load(page.nextCursor ?? undefined)}
        >
          {page.loading ? "Cargando…" : "Más resultados de la búsqueda"}
        </button>
      )}
      {page && (
        <p className="study-session-info">
          Los resultados son de esta materia y de las páginas cargadas. Un
          apunte ocupa 25 minutos y una pregunta 20. El plan admite hasta{" "}
          {maxTasks} actividades y no puede superar 1.200 minutos.
        </p>
      )}
    </section>
  );
}
