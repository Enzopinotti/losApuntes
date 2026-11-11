import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  AcademicInstitutionOption,
  OrganizationCard,
  OrganizationType,
  OrganizationVerificationState,
} from "../features/organizations/interfaces";
import {
  appendUniqueOrganizations,
  organizationDirectoryCursorRepeats,
} from "../features/organizations/organization-directory-pagination.mjs";
import {
  organizationDirectoryClearParams,
  organizationDirectoryFiltersFromParams,
  organizationDirectoryInstitutionParams,
  organizationDirectoryListHref,
  organizationDirectorySearchParams,
} from "../features/organizations/organization-directory-navigation.mjs";
import {
  isOrganizationsApiError,
  organizationsApi,
} from "../features/organizations/services/organizationsService";
import { OrganizationAvatar } from "../features/organizations/OrganizationAvatar";
import { OrganizationDirectoryFollowAction } from "../features/organizations/OrganizationDirectoryFollowAction";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./Organizations.scss";

const typeLabels: Record<OrganizationType, string> = {
  student_center: "Centro de estudiantes",
  association: "Asociación",
  club: "Club",
  lab: "Laboratorio",
  research_group: "Grupo de investigación",
  alumni_association: "Asociación de graduados",
  incubator: "Incubadora",
  cultural_sports: "Grupo cultural o deportivo",
  career_community: "Comunidad de carrera",
};

const repeatedDirectoryCursorMessage =
  "El servidor repitió un cursor de página. Detuvimos esta lista para evitar resultados duplicados.";

function messageFor(error: unknown): string {
  if (!isOrganizationsApiError(error)) {
    return "No pudimos completar la operación.";
  }
  if (error.code === "EMAIL_VERIFICATION_REQUIRED") {
    return "Verificá tu email antes de crear o administrar organizaciones.";
  }
  if (error.code === "ORGANIZATION_PROFILE_REQUIRED") {
    return "Completá tu perfil antes de crear una organización.";
  }
  return error.message;
}

const Organizations = () => {
  const { status, user, session } = useAuth();
  const authenticated = status === "authenticated";
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedFilters = organizationDirectoryFiltersFromParams(searchParams);
  const invalidDirectoryFilters = appliedFilters === null;
  const appliedQuery = appliedFilters?.q ?? "";
  const appliedType = (appliedFilters?.type ?? "") as OrganizationType | "";
  const appliedVerificationState = (appliedFilters?.verificationState ??
    "") as OrganizationVerificationState | "";
  const appliedInstitutionId = appliedFilters?.institutionId ?? "";
  const directoryLink = organizationDirectoryListHref(searchParams);
  const authScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  // Drafts are distinct from URL-applied filters; typing does not fetch.
  const [query, setQuery] = useState(appliedQuery);
  const [type, setType] = useState<OrganizationType | "">(appliedType);
  const [verificationState, setVerificationState] = useState<
    OrganizationVerificationState | ""
  >(appliedVerificationState);
  const [searchSubmitError, setSearchSubmitError] = useState<string | null>(null);
  useEffect(() => {
    // Restore applied filters on Back/Forward and new shared links.
    setQuery(appliedQuery);
    setType(appliedType);
    setVerificationState(appliedVerificationState);
    setSearchSubmitError(null);
  }, [appliedQuery, appliedType, appliedVerificationState]);
  const [filterInstitutionQuery, setFilterInstitutionQuery] = useState("");
  const [filterInstitutionSelection, setFilterInstitutionSelection] = useState<{
    authScopeKey: string;
    institution: AcademicInstitutionOption;
  } | null>(null);
  const filterInstitution =
    filterInstitutionSelection?.authScopeKey === authScopeKey &&
    filterInstitutionSelection.institution.id === appliedInstitutionId
      ? filterInstitutionSelection.institution
      : appliedInstitutionId
        ? { id: appliedInstitutionId, name: "la institución del enlace" }
        : null;
  const directoryScopeKey = [
    "organizations-directory",
    authScopeKey,
    invalidDirectoryFilters ? "invalid-directory-link" : appliedQuery,
    appliedType || "all-types",
    appliedVerificationState || "all-verification-states",
    filterInstitution?.id ?? "all-institutions",
  ].join(":");
  const {
    begin: beginDirectoryLoad,
    isCurrent: isDirectoryLoadCurrent,
    finish: finishDirectoryLoad,
  } = useAsyncAuthorityFence(directoryScopeKey);
  const {
    begin: beginCreate,
    isCurrent: isCreateCurrent,
    finish: finishCreate,
  } = useAsyncAuthorityFence(`organizations-create:${authScopeKey}`);
  const filterInstitutionSearchScopeKey = [
    "organizations-filter-institutions",
    authScopeKey,
    filterInstitutionQuery.trim(),
  ].join(":");
  const {
    begin: beginFilterInstitutionSearch,
    isCurrent: isFilterInstitutionSearchCurrent,
    finish: finishFilterInstitutionSearch,
  } = useAsyncAuthorityFence(filterInstitutionSearchScopeKey);
  const [listState, setListState] = useState<{
    scopeKey: string;
    items: OrganizationCard[];
    loading: boolean;
    loadingMore: boolean;
    nextCursor: string | null;
  } | null>(null);
  const currentListState =
    listState?.scopeKey === directoryScopeKey ? listState : null;
  const items = currentListState?.items ?? [];
  const loading = currentListState?.loading ?? true;
  const loadingMore = currentListState?.loadingMore ?? false;
  const nextCursor = currentListState?.nextCursor ?? null;
  const requestedCursorsRef = useRef<{
    scopeKey: string;
    cursors: Set<string>;
  } | null>(null);
  const paginationRequestRef = useRef<{
    scopeKey: string;
    cursor: string;
  } | null>(null);
  const [paginationErrorState, setPaginationErrorState] = useState<{
    scopeKey: string;
    message: string;
  } | null>(null);
  const paginationError =
    paginationErrorState?.scopeKey === directoryScopeKey
      ? paginationErrorState.message
      : null;
  const [busyState, setBusyState] = useState<{
    scopeKey: string;
    value: boolean;
  } | null>(null);
  const busy = busyState?.scopeKey === authScopeKey ? busyState.value : false;
  const [errorState, setErrorState] = useState<{
    scopeKey: string;
    message: string;
  } | null>(null);
  const error =
    errorState?.scopeKey === authScopeKey ? errorState.message : null;
  const [feedbackState, setFeedbackState] = useState<{
    scopeKey: string;
    message: string;
  } | null>(null);
  const feedback =
    feedbackState?.scopeKey === authScopeKey ? feedbackState.message : null;
  const [directoryShareFeedback, setDirectoryShareFeedback] = useState<{
    scopeKey: string;
    message: string;
  } | null>(null);
  const shareScopeKey = [authScopeKey, directoryLink ?? "invalid"].join(":");

  const updateFollowing = useCallback(
    (organizationId: string, following: boolean) => {
      setListState((current) =>
        current?.scopeKey === directoryScopeKey
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === organizationId
                  ? { ...item, viewer: { ...item.viewer, following } }
                  : item,
              ),
            }
          : current,
      );
    },
    [directoryScopeKey],
  );

  const [name, setName] = useState("");
  const [createType, setCreateType] =
    useState<OrganizationType>("student_center");
  const [about, setAbout] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [institutionQuery, setInstitutionQuery] = useState("");
  const institutionSearchScopeKey = [
    "organizations-institutions",
    authScopeKey,
    institutionQuery.trim(),
  ].join(":");
  const {
    begin: beginInstitutionSearch,
    isCurrent: isInstitutionSearchCurrent,
    finish: finishInstitutionSearch,
  } = useAsyncAuthorityFence(institutionSearchScopeKey);
  const [institutionsState, setInstitutionsState] = useState<{
    scopeKey: string;
    items: AcademicInstitutionOption[];
  } | null>(null);
  const institutions =
    institutionsState?.scopeKey === institutionSearchScopeKey
      ? institutionsState.items
      : [];
  const [institutionSelection, setInstitutionSelection] = useState<{
    authScopeKey: string;
    institution: AcademicInstitutionOption;
  } | null>(null);
  const institution =
    institutionSelection?.authScopeKey === authScopeKey
      ? institutionSelection.institution
      : null;
  const [filterInstitutionsState, setFilterInstitutionsState] = useState<{
    scopeKey: string;
    items: AcademicInstitutionOption[];
  } | null>(null);
  const filterInstitutions =
    filterInstitutionsState?.scopeKey === filterInstitutionSearchScopeKey
      ? filterInstitutionsState.items
      : [];
  const [filterInstitutionBusyState, setFilterInstitutionBusyState] = useState<{
    scopeKey: string;
    value: boolean;
  } | null>(null);
  const filterInstitutionBusy =
    filterInstitutionBusyState?.scopeKey === filterInstitutionSearchScopeKey &&
    filterInstitutionBusyState.value;

  const load = useCallback(async () => {
    const ticket = beginDirectoryLoad();
    if (!isDirectoryLoadCurrent(ticket)) return;
    requestedCursorsRef.current = {
      scopeKey: directoryScopeKey,
      cursors: new Set(),
    };
    setListState((current) => ({
      scopeKey: directoryScopeKey,
      items: current?.scopeKey === directoryScopeKey ? current.items : [],
      loading: true,
      loadingMore: false,
      nextCursor: null,
    }));
    setErrorState(null);
    setPaginationErrorState(null);
    if (invalidDirectoryFilters) {
      setListState({
        scopeKey: directoryScopeKey,
        items: [],
        loading: false,
        loadingMore: false,
        nextCursor: null,
      });
      finishDirectoryLoad(ticket);
      return;
    }
    try {
      const result = await organizationsApi.search(
        {
          q: appliedQuery || undefined,
          type: appliedType || undefined,
          verificationState: appliedVerificationState || undefined,
          institutionId: filterInstitution?.id,
        },
        ticket.signal,
      );
      if (!isDirectoryLoadCurrent(ticket)) return;
      setListState({
        scopeKey: directoryScopeKey,
        items: result.items,
        loading: false,
        loadingMore: false,
        nextCursor: result.nextCursor,
      });
    } catch (nextError) {
      if (!isDirectoryLoadCurrent(ticket)) return;
      setErrorState({
        scopeKey: authScopeKey,
        message: messageFor(nextError),
      });
      setListState((current) =>
        current?.scopeKey === directoryScopeKey
          ? { ...current, loading: false }
          : current,
      );
    } finally {
      finishDirectoryLoad(ticket);
    }
  }, [
    authScopeKey,
    beginDirectoryLoad,
    directoryScopeKey,
    finishDirectoryLoad,
    isDirectoryLoadCurrent,
    filterInstitution?.id,
    appliedQuery,
    appliedType,
    appliedVerificationState,
    invalidDirectoryFilters,
  ]);
  const loadMore = useCallback(async () => {
    const current =
      listState?.scopeKey === directoryScopeKey ? listState : null;
    const cursor = current?.nextCursor;
    if (
      invalidDirectoryFilters ||
      !current ||
      current.loading ||
      current.loadingMore ||
      !cursor
    ) return;
    if (paginationRequestRef.current?.scopeKey === directoryScopeKey) return;
    const history =
      requestedCursorsRef.current?.scopeKey === directoryScopeKey
        ? requestedCursorsRef.current
        : null;
    if (history?.cursors.has(cursor)) {
      setPaginationErrorState({
        scopeKey: directoryScopeKey,
        message: repeatedDirectoryCursorMessage,
      });
      setListState((latest) =>
        latest?.scopeKey === directoryScopeKey
          ? { ...latest, nextCursor: null }
          : latest,
      );
      return;
    }

    const request = { scopeKey: directoryScopeKey, cursor };
    paginationRequestRef.current = request;
    const ticket = beginDirectoryLoad();
    if (!isDirectoryLoadCurrent(ticket)) {
      if (paginationRequestRef.current === request) {
        paginationRequestRef.current = null;
      }
      return;
    }

    setListState((latest) =>
      latest?.scopeKey === directoryScopeKey
        ? { ...latest, loadingMore: true }
        : latest,
    );
    setPaginationErrorState(null);

    try {
      const result = await organizationsApi.search(
        {
          q: appliedQuery || undefined,
          type: appliedType || undefined,
          verificationState: appliedVerificationState || undefined,
          institutionId: filterInstitution?.id,
          cursor,
        },
        ticket.signal,
      );
      if (!isDirectoryLoadCurrent(ticket)) return;
      const cursorState =
        requestedCursorsRef.current?.scopeKey === directoryScopeKey
          ? requestedCursorsRef.current
          : { scopeKey: directoryScopeKey, cursors: new Set<string>() };
      const repeatedCursor = organizationDirectoryCursorRepeats(
        cursorState.cursors,
        cursor,
        result.nextCursor,
      );
      cursorState.cursors.add(cursor);
      requestedCursorsRef.current = cursorState;
      setListState((latest) =>
        latest?.scopeKey === directoryScopeKey
          ? {
              ...latest,
              items: appendUniqueOrganizations(latest.items, result.items),
              loadingMore: false,
              nextCursor: repeatedCursor ? null : result.nextCursor,
            }
          : latest,
      );
      if (repeatedCursor) {
        setPaginationErrorState({
          scopeKey: directoryScopeKey,
          message: repeatedDirectoryCursorMessage,
        });
      }
    } catch (nextError) {
      if (!isDirectoryLoadCurrent(ticket)) return;
      setPaginationErrorState({
        scopeKey: directoryScopeKey,
        message: messageFor(nextError),
      });
      setListState((latest) =>
        latest?.scopeKey === directoryScopeKey
          ? { ...latest, loadingMore: false }
          : latest,
      );
    } finally {
      finishDirectoryLoad(ticket);
      if (paginationRequestRef.current === request) {
        paginationRequestRef.current = null;
      }
    }
  }, [
    beginDirectoryLoad,
    directoryScopeKey,
    finishDirectoryLoad,
    isDirectoryLoadCurrent,
    filterInstitution?.id,
    listState,
    appliedQuery,
    appliedType,
    appliedVerificationState,
    invalidDirectoryFilters,
  ]);

  const loadRef = useRef(load);
  loadRef.current = load;

  const applyDirectorySearch = () => {
    const next = organizationDirectorySearchParams(
      searchParams,
      query,
      type,
      verificationState,
    );
    if (!next) {
      setSearchSubmitError(
        "La búsqueda debe tener entre 2 y 120 caracteres, o estar vacía.",
      );
      return;
    }
    setSearchSubmitError(null);
    if (next.toString() === searchParams.toString()) {
      void loadRef.current();
    } else {
      setSearchParams(next);
    }
  };

  const clearDirectorySearch = () => {
    setSearchSubmitError(null);
    setFilterInstitutionSelection(null);
    setFilterInstitutionQuery("");
    setFilterInstitutionsState(null);
    setSearchParams((current) => organizationDirectoryClearParams(current));
  };

  const updateDirectoryInstitution = (
    nextInstitution: AcademicInstitutionOption | null,
  ) => {
    const next = organizationDirectoryInstitutionParams(
      searchParams,
      nextInstitution?.id ?? null,
    );
    if (!next) return;
    setFilterInstitutionSelection(
      nextInstitution
        ? { authScopeKey, institution: nextInstitution }
        : null,
    );
    setFilterInstitutionsState(null);
    setSearchSubmitError(null);
    setSearchParams(next);
  };

  const copyDirectorySearch = async () => {
    if (!directoryLink) return;
    const scopeKey = shareScopeKey;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(
        new URL(directoryLink, window.location.origin).toString(),
      );
      setDirectoryShareFeedback({
        scopeKey,
        message: "Enlace del directorio copiado con los filtros públicos aplicados.",
      });
    } catch {
      setDirectoryShareFeedback({
        scopeKey,
        message:
          "No pudimos copiar el enlace. Podés abrirlo y copiarlo desde el navegador.",
      });
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setName("");
    setAbout("");
    setWebsiteUrl("");
    setInstitutionQuery("");
    setFilterInstitutionQuery("");
    setInstitutionsState(null);
    setFilterInstitutionsState(null);
    setInstitutionSelection(null);
    setFilterInstitutionSelection(null);
  }, [authScopeKey]);

  const searchFilterInstitutions = async () => {
    if (filterInstitutionQuery.trim().length < 2) return;
    const ticket = beginFilterInstitutionSearch();
    if (!isFilterInstitutionSearchCurrent(ticket)) return;
    setFilterInstitutionBusyState({
      scopeKey: filterInstitutionSearchScopeKey,
      value: true,
    });
    setFilterInstitutionsState(null);
    setErrorState(null);
    try {
      const result = await organizationsApi.searchInstitutions(
        filterInstitutionQuery.trim(),
        ticket.signal,
      );
      if (!isFilterInstitutionSearchCurrent(ticket)) return;
      setFilterInstitutionsState({
        scopeKey: filterInstitutionSearchScopeKey,
        items: result,
      });
    } catch (nextError) {
      if (!isFilterInstitutionSearchCurrent(ticket)) return;
      setErrorState({ scopeKey: authScopeKey, message: messageFor(nextError) });
    } finally {
      if (finishFilterInstitutionSearch(ticket)) {
        setFilterInstitutionBusyState({
          scopeKey: filterInstitutionSearchScopeKey,
          value: false,
        });
      }
    }
  };

  const searchInstitutions = async () => {
    if (institutionQuery.trim().length < 2) return;
    const ticket = beginInstitutionSearch();
    if (!isInstitutionSearchCurrent(ticket)) return;
    setErrorState(null);
    try {
      const result = await organizationsApi.searchInstitutions(
        institutionQuery.trim(),
        ticket.signal,
      );
      if (!isInstitutionSearchCurrent(ticket)) return;
      setInstitutionsState({
        scopeKey: institutionSearchScopeKey,
        items: result,
      });
    } catch (nextError) {
      if (!isInstitutionSearchCurrent(ticket)) return;
      setErrorState({
        scopeKey: authScopeKey,
        message: messageFor(nextError),
      });
    } finally {
      finishInstitutionSearch(ticket);
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!institution) return;

    const selectedInstitution = institution;
    const ticket = beginCreate();
    if (!isCreateCurrent(ticket)) return;
    setBusyState({ scopeKey: authScopeKey, value: true });
    setErrorState(null);
    setFeedbackState(null);
    try {
      const result = await organizationsApi.create(
        {
          name,
          type: createType,
          institutionId: selectedInstitution.id,
          about: about.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
        },
        ticket.signal,
      );
      if (!isCreateCurrent(ticket)) return;
      setName("");
      setAbout("");
      setWebsiteUrl("");
      setInstitutionSelection(null);
      setInstitutionQuery("");
      setInstitutionsState(null);
      setFeedbackState({
        scopeKey: authScopeKey,
        message: `Organización creada: ${result.organization.name}. Empieza sin verificación institucional.`,
      });
      await loadRef.current();
    } catch (nextError) {
      if (!isCreateCurrent(ticket)) return;
      setErrorState({
        scopeKey: authScopeKey,
        message: messageFor(nextError),
      });
    } finally {
      if (finishCreate(ticket)) {
        setBusyState({ scopeKey: authScopeKey, value: false });
      }
    }
  };

  return (
    <section
      className="organizations-page"
      aria-labelledby="organizations-title"
    >
      <header className="organizations-hero">
        <div>
          <p className="organizations-eyebrow">Comunidad del campus</p>
          <h1 id="organizations-title">Organizaciones</h1>
          <p>
            Centros, clubes, laboratorios y comunidades tienen identidad propia.
            Una organización verificada confirma un claim revisado; no implica
            respaldo de Los Apuntes.
          </p>
        </div>
      </header>

      {feedback && (
        <p className="organizations-success" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="organizations-error" role="alert">
          {error}
        </p>
      )}
      {invalidDirectoryFilters && (
        <p className="organizations-error" role="alert">
          El enlace tiene filtros inválidos o repetidos. No mostraremos
          resultados sin los filtros que intentaste usar. Limpiá los filtros
          para volver a explorar el directorio.
        </p>
      )}
      {searchSubmitError && (
        <p className="organizations-error" role="alert">
          {searchSubmitError}
        </p>
      )}

      <form
        className="organizations-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          applyDirectorySearch();
        }}
      >
        <input
          aria-label="Buscar organizaciones"
          type="search"
          minLength={2}
          maxLength={120}
          placeholder="Buscar por nombre"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Tipo de organización"
          value={type}
          onChange={(event) =>
            setType(event.target.value as OrganizationType | "")
          }
        >
          <option value="">Todos los tipos</option>
          {Object.entries(typeLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Estado de verificación"
          value={verificationState}
          onChange={(event) =>
            setVerificationState(
              event.target.value as OrganizationVerificationState | "",
            )
          }
        >
          <option value="">Todas las verificaciones</option>
          <option value="verified">Verificadas</option>
          <option value="unverified">Sin verificar</option>
        </select>
        <button type="submit" disabled={loading}>
          Buscar
        </button>
        <button
          type="button"
          className="secondary"
          onClick={clearDirectorySearch}
          disabled={
            !searchParams.has("q") &&
            !searchParams.has("type") &&
            !searchParams.has("verificationState") &&
            !searchParams.has("institutionId")
          }
        >
          Limpiar todos los filtros
        </button>
      </form>

      <div className="organizations-directory-share">
        <p role="status">
          {invalidDirectoryFilters
            ? "Búsqueda suspendida: el enlace no es válido."
            : "Los filtros se aplican al buscar, no mientras escribís."}
        </p>
        {directoryLink && (
          <div className="organizations-directory-share-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => void copyDirectorySearch()}
            >
              Copiar búsqueda
            </button>
            <Link to={directoryLink}>Abrir enlace compartible</Link>
          </div>
        )}
        {directoryShareFeedback?.scopeKey === shareScopeKey && (
          <p role="status">{directoryShareFeedback.message}</p>
        )}
      </div>

      <div className="organizations-institution-filter">
        <label htmlFor="organizations-filter-institution">
          Filtrar por institución
        </label>
        <div className="organizations-inline">
          <input
            id="organizations-filter-institution"
            value={filterInstitutionQuery}
            onChange={(event) => {
              setFilterInstitutionQuery(event.target.value);
              setFilterInstitutionsState(null);
            }}
            placeholder="Buscar universidad"
          />
          <button
            type="button"
            disabled={
              filterInstitutionQuery.trim().length < 2 || filterInstitutionBusy
            }
            onClick={() => void searchFilterInstitutions()}
          >
            {filterInstitutionBusy ? "Buscando…" : "Buscar institución"}
          </button>
        </div>
        {filterInstitution && (
          <div className="organizations-selected-institution">
            <span>Filtro activo: {filterInstitution.name}</span>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                updateDirectoryInstitution(null);
                setFilterInstitutionQuery("");
              }}
            >
              Quitar filtro
            </button>
          </div>
        )}
        {filterInstitutions.length > 0 && (
          <ul className="organization-option-list">
            {filterInstitutions.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => {
                    setFilterInstitutionSelection({
                      authScopeKey,
                      institution: option,
                    });
                    updateDirectoryInstitution(option);
                    setFilterInstitutionQuery(option.name);
                    setErrorState(null);
                  }}
                >
                  {option.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {filterInstitutionsState?.scopeKey ===
          filterInstitutionSearchScopeKey &&
          filterInstitutions.length === 0 &&
          !filterInstitutionBusy && (
            <p className="organizations-filter-empty" role="status">
              No encontramos instituciones con ese nombre.
            </p>
          )}
      </div>

      <section className="organizations-list" aria-live="polite">
        {loading ? (
          <p>Cargando organizaciones…</p>
        ) : items.length === 0 ? (
          <p>No encontramos organizaciones con esos filtros.</p>
        ) : (
          items.map((item) => (
            <article className="organization-card" key={item.id}>
              <div className="organization-card-main">
                <OrganizationAvatar
                  avatarUrl={item.avatarUrl}
                  name={item.name}
                  size="small"
                />
                <div className="organization-card-copy">
                  <span className="organization-type">
                    {typeLabels[item.type]}
                  </span>
                  <h2>{item.name}</h2>
                  <p>{item.institution.name}</p>
                  <span className="organization-verification">
                    {item.verificationState === "verified"
                      ? "Identidad verificada"
                      : "Claim sin verificar"}
                  </span>
                </div>
              </div>
              <div className="organization-card-actions">
                {authenticated && (
                  <OrganizationDirectoryFollowAction
                    organization={item}
                    authScopeKey={authScopeKey}
                    onFollowingChanged={updateFollowing}
                  />
                )}
                <Link to={`/organizations/${item.id}`}>Ver organización</Link>
              </div>
            </article>
          ))
        )}
      </section>

      {paginationError && (
        <p className="organizations-error" role="alert">
          No pudimos cargar más organizaciones: {paginationError}
        </p>
      )}
      {nextCursor && (
        <div className="organizations-load-more">
          <button
            type="button"
            className="secondary"
            aria-busy={loadingMore}
            disabled={loading || loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore
              ? "Cargando más organizaciones…"
              : paginationError
                ? "Reintentar carga"
                : "Cargar más organizaciones"}
          </button>
        </div>
      )}

      {authenticated ? (
        <details className="organizations-create">
          <summary>Crear una organización</summary>
          <p>
            La creación te asigna como owner, pero no verifica automáticamente
            la organización.
          </p>
          <form className="organizations-form" onSubmit={create}>
            <label>
              Nombre
              <input
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Tipo
              <select
                value={createType}
                onChange={(event) =>
                  setCreateType(event.target.value as OrganizationType)
                }
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="organizations-wide">
              Acerca de
              <textarea
                rows={4}
                maxLength={2000}
                value={about}
                onChange={(event) => setAbout(event.target.value)}
              />
            </label>
            <label className="organizations-wide">
              Sitio oficial (HTTPS)
              <input
                type="url"
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>

            <div className="organizations-wide organization-institution-picker">
              <label>
                Institución canónica
                <div className="organizations-inline">
                  <input
                    value={institutionQuery}
                    onChange={(event) =>
                      setInstitutionQuery(event.target.value)
                    }
                    placeholder="Buscar universidad"
                  />
                  <button
                    type="button"
                    onClick={() => void searchInstitutions()}
                  >
                    Buscar
                  </button>
                </div>
              </label>
              {institution && (
                <p>
                  Institución seleccionada: <strong>{institution.name}</strong>
                </p>
              )}
              {institutions.length > 0 && (
                <ul className="organization-option-list">
                  {institutions.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setInstitutionSelection({
                            authScopeKey,
                            institution: option,
                          })
                        }
                      >
                        {option.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button type="submit" disabled={busy || !institution}>
              {busy ? "Creando…" : "Crear organización"}
            </button>
          </form>
        </details>
      ) : (
        <p className="organizations-login-note">
          <Link to="/login">Iniciá sesión</Link> para crear y seguir
          organizaciones.
        </p>
      )}
    </section>
  );
};

export default Organizations;
