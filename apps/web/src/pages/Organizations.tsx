import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  AcademicInstitutionOption,
  OrganizationCard,
  OrganizationType,
} from "../features/organizations/interfaces";
import { OrganizationAvatar } from "../features/organizations/OrganizationAvatar";
import {
  isOrganizationsApiError,
  organizationsApi,
} from "../features/organizations/services/organizationsService";
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

function isAmbiguousMutationError(error: unknown): boolean {
  return (
    isOrganizationsApiError(error) &&
    (error.status === 0 || error.status >= 500)
  );
}

function OrganizationDirectoryFollowAction({
  organization,
  authScopeKey,
  onFollowingChanged,
}: {
  organization: OrganizationCard;
  authScopeKey: string;
  onFollowingChanged: (organizationId: string, following: boolean) => void;
}) {
  const scopeKey = `organization-directory-follow:${authScopeKey}:${organization.id}`;
  const {
    begin: beginAction,
    isCurrent: isActionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(scopeKey);
  const [followingState, setFollowingState] = useState<{
    scopeKey: string;
    value: boolean;
  } | null>(null);
  const following =
    followingState?.scopeKey === scopeKey
      ? followingState.value
      : Boolean(organization.viewer?.following);
  const [busyState, setBusyState] = useState<{
    scopeKey: string;
    value: boolean;
  } | null>(null);
  const busy = busyState?.scopeKey === scopeKey && busyState.value;
  const [feedbackState, setFeedbackState] = useState<{
    scopeKey: string;
    message: string;
    isError: boolean;
  } | null>(null);
  const feedback = feedbackState?.scopeKey === scopeKey ? feedbackState : null;

  const toggleFollowing = async () => {
    if (busy) return;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    const desiredFollowing = !following;
    setBusyState({ scopeKey, value: true });
    setFeedbackState(null);

    try {
      const result = !desiredFollowing
        ? await organizationsApi.unfollow(organization.id, ticket.signal)
        : await organizationsApi.follow(organization.id, ticket.signal);
      if (!isActionCurrent(ticket)) return;
      setFollowingState({ scopeKey, value: result.following });
      onFollowingChanged(organization.id, result.following);
      setFeedbackState({
        scopeKey,
        message: result.following
          ? `Ahora seguís ${organization.name}.`
          : `Dejaste de seguir ${organization.name}.`,
        isError: false,
      });
    } catch (error) {
      if (!isActionCurrent(ticket)) return;
      if (isAmbiguousMutationError(error)) {
        try {
          const result = await organizationsApi.get(
            organization.id,
            ticket.signal,
          );
          if (!isActionCurrent(ticket)) return;
          const confirmedFollowing = Boolean(
            result.organization.viewer?.following,
          );
          setFollowingState({ scopeKey, value: confirmedFollowing });
          onFollowingChanged(organization.id, confirmedFollowing);
          const confirmed = confirmedFollowing === desiredFollowing;
          setFeedbackState({
            scopeKey,
            message: confirmed
              ? confirmedFollowing
                ? `Ahora seguís ${organization.name}.`
                : `Dejaste de seguir ${organization.name}.`
              : confirmedFollowing
                ? `Todavía seguís ${organization.name}; el cambio no se completó.`
                : `Todavía no seguís ${organization.name}; el cambio no se completó.`,
            isError: !confirmed,
          });
        } catch {
          if (!isActionCurrent(ticket)) return;
          setFeedbackState({
            scopeKey,
            message: messageFor(error),
            isError: true,
          });
        }
      } else {
        setFeedbackState({
          scopeKey,
          message: messageFor(error),
          isError: true,
        });
      }
    } finally {
      if (finishAction(ticket)) {
        setBusyState({ scopeKey, value: false });
      }
    }
  };

  return (
    <div className="organization-directory-follow">
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggleFollowing()}
        aria-label={`${following ? "Dejar de seguir" : "Seguir"} ${organization.name}`}
      >
        {busy ? "Actualizando…" : following ? "Dejar de seguir" : "Seguir"}
      </button>
      {feedback && (
        <span role={feedback.isError ? "alert" : "status"}>
          {feedback.message}
        </span>
      )}
    </div>
  );
}

const Organizations = () => {
  const { status, user, session } = useAuth();
  const authenticated = status === "authenticated";
  const authScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<OrganizationType | "">("");
  const [filterInstitutionQuery, setFilterInstitutionQuery] = useState("");
  const [filterInstitutionSelection, setFilterInstitutionSelection] = useState<{
    authScopeKey: string;
    institution: AcademicInstitutionOption;
  } | null>(null);
  const filterInstitution =
    filterInstitutionSelection?.authScopeKey === authScopeKey
      ? filterInstitutionSelection.institution
      : null;
  const directoryScopeKey = [
    "organizations-directory",
    authScopeKey,
    query.trim(),
    type || "all-types",
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
  } | null>(null);
  const currentListState =
    listState?.scopeKey === directoryScopeKey ? listState : null;
  const items = currentListState?.items ?? [];
  const loading = currentListState?.loading ?? true;
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
    setListState((current) => ({
      scopeKey: directoryScopeKey,
      items: current?.scopeKey === directoryScopeKey ? current.items : [],
      loading: true,
    }));
    setErrorState(null);
    try {
      const result = await organizationsApi.search(
        {
          q: query.trim() || undefined,
          type: type || undefined,
          institutionId: filterInstitution?.id,
        },
        ticket.signal,
      );
      if (!isDirectoryLoadCurrent(ticket)) return;
      setListState({
        scopeKey: directoryScopeKey,
        items: result.items,
        loading: false,
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
    query,
    type,
  ]);
  const loadRef = useRef(load);
  loadRef.current = load;

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
      setErrorState({
        scopeKey: authScopeKey,
        message: messageFor(nextError),
      });
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

      <form
        className="organizations-search"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <input
          aria-label="Buscar organizaciones"
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
        <button type="submit" disabled={loading}>
          Buscar
        </button>
      </form>

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
              setFilterInstitutionSelection(null);
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
                setFilterInstitutionSelection(null);
                setFilterInstitutionQuery("");
                setFilterInstitutionsState(null);
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
                    setFilterInstitutionQuery(option.name);
                    setFilterInstitutionsState(null);
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
