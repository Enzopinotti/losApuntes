import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "../contexts/useAuth";
import type {
  AcademicAffiliation,
  AcademicCatalogNode,
  AcademicLifecycleResponse,
  AcademicRelationshipRole,
} from "../features/academic/interfaces";
import {
  academicApi,
  isAcademicApiError,
} from "../features/academic/services/academicService";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./AcademicLifecycle.scss";

const roleLabels: Record<AcademicRelationshipRole, string> = {
  student: "Estudiante",
  advanced_student: "Estudiante avanzado",
  recent_graduate: "Graduado reciente",
  alumni: "Alumni",
  mentor: "Mentor",
  teaching: "Docencia",
  research: "Investigación",
  community: "Comunidad",
};

function rolesFor(
  status: AcademicAffiliation["status"],
): AcademicRelationshipRole[] {
  if (status === "active" || status === "paused") {
    return [
      "student",
      "advanced_student",
      "mentor",
      "teaching",
      "research",
      "community",
    ];
  }

  if (status === "completed" || status === "alumni") {
    return [
      "recent_graduate",
      "alumni",
      "mentor",
      "teaching",
      "research",
      "community",
    ];
  }

  return ["mentor", "teaching", "research", "community"];
}

function phaseLabel(phase: AcademicLifecycleResponse["phase"]): string {
  if (phase === "student") return "Etapa estudiantil";
  if (phase === "alumni") return "Etapa alumni";
  if (phase === "mixed") return "Trayectoria mixta";
  return "Comunidad universitaria";
}

function errorMessage(error: unknown): string {
  if (!isAcademicApiError(error)) return "No pudimos completar la operación.";
  if (error.code === "ACADEMIC_GRADUATION_INELIGIBLE") {
    return "Esta afiliación no puede pasar a alumni desde su estado actual.";
  }
  if (error.code === "ACADEMIC_AFFILIATION_ROLE_INVALID") {
    return "Los roles elegidos no son compatibles con el estado de esta afiliación.";
  }
  if (error.code === "ACADEMIC_INVENTORY_OVERFLOW") {
    return "Tu historia académica supera el límite seguro para tomar esta decisión. No aplicamos cambios con una vista incompleta.";
  }
  return error.message;
}

const AcademicLifecycle = () => {
  const { status, user, session } = useAuth();
  const authScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const {
    begin: beginLoad,
    isCurrent: isLoadCurrent,
    finish: finishLoad,
  } = useAsyncAuthorityFence(`academic-load:${authScopeKey}`);
  const {
    begin: beginMutation,
    isCurrent: isMutationCurrent,
    finish: finishMutation,
  } = useAsyncAuthorityFence(`academic-mutation:${authScopeKey}`);

  const [snapshotState, setSnapshotState] = useState<{
    scopeKey: string;
    lifecycle: AcademicLifecycleResponse;
    affiliations: AcademicAffiliation[];
    affiliationsTruncated: boolean;
    affiliationLimit: number;
    labels: Record<string, string>;
  } | null>(null);
  const snapshot =
    snapshotState?.scopeKey === authScopeKey ? snapshotState : null;
  const lifecycle = snapshot?.lifecycle ?? null;
  const affiliations = snapshot?.affiliations ?? [];
  const affiliationsTruncated = snapshot?.affiliationsTruncated ?? false;
  const affiliationLimit = snapshot?.affiliationLimit ?? 50;
  const labels = snapshot?.labels ?? {};

  const [graduatedOn, setGraduatedOn] = useState<Record<string, string>>({});
  const [roleDrafts, setRoleDrafts] = useState<
    Record<string, AcademicRelationshipRole[]>
  >({});
  const [searchKind, setSearchKind] = useState<"institution" | "program">(
    "institution",
  );
  const [searchText, setSearchText] = useState("");
  const searchScopeKey = [
    authScopeKey,
    searchKind,
    searchText.trim(),
  ].join(":");
  const {
    begin: beginSearch,
    isCurrent: isSearchCurrent,
    finish: finishSearch,
  } = useAsyncAuthorityFence(`academic-search:${searchScopeKey}`);
  const [searchState, setSearchState] = useState<{
    scopeKey: string;
    busy: boolean;
    error: string | null;
    items: AcademicCatalogNode[];
  } | null>(null);
  const currentSearchState =
    searchState?.scopeKey === searchScopeKey ? searchState : null;
  const results = currentSearchState?.items ?? [];

  const [loadState, setLoadState] = useState<{
    scopeKey: string;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const currentLoadState =
    loadState?.scopeKey === authScopeKey ? loadState : null;
  const loading = currentLoadState?.loading ?? true;

  const [mutationState, setMutationState] = useState<{
    scopeKey: string;
    busy: string | null;
    error: string | null;
    feedback: string | null;
  } | null>(null);
  const currentMutationState =
    mutationState?.scopeKey === authScopeKey ? mutationState : null;
  const busy =
    currentMutationState?.busy ??
    (currentSearchState?.busy ? "search" : null);
  const feedback = currentMutationState?.feedback ?? null;
  const error =
    currentMutationState?.error ??
    currentSearchState?.error ??
    currentLoadState?.error ??
    null;

  const followedIds = useMemo(
    () => new Set(lifecycle?.follows.map((item) => item.targetId) ?? []),
    [lifecycle],
  );

  const load = useCallback(async () => {
    const ticket = beginLoad();
    if (!isLoadCurrent(ticket)) return;
    setLoadState({
      scopeKey: authScopeKey,
      loading: true,
      error: null,
    });

    try {
      const [nextLifecycle, affiliationResponse] = await Promise.all([
        academicApi.lifecycle(ticket.signal),
        academicApi.affiliations(ticket.signal),
      ]);
      if (!isLoadCurrent(ticket)) return;

      const nodeIds = [
        ...new Set(
          affiliationResponse.affiliations.flatMap((row) =>
            [row.institutionId, row.programId].filter(
              (value): value is string => Boolean(value),
            ),
          ),
        ),
      ];
      const entries = await Promise.all(
        nodeIds.map(async (id) => {
          try {
            const result = await academicApi.node(id, ticket.signal);
            return [id, result.node.name] as const;
          } catch {
            return [id, id] as const;
          }
        }),
      );
      if (!isLoadCurrent(ticket)) return;

      setSnapshotState({
        scopeKey: authScopeKey,
        lifecycle: nextLifecycle,
        affiliations: affiliationResponse.affiliations,
        affiliationsTruncated: affiliationResponse.truncated,
        affiliationLimit: affiliationResponse.limit,
        labels: Object.fromEntries(entries),
      });
      setRoleDrafts(
        Object.fromEntries(
          affiliationResponse.affiliations.map((row) => [row.id, row.roles]),
        ),
      );
    } catch (nextError) {
      if (!isLoadCurrent(ticket)) return;
      setLoadState({
        scopeKey: authScopeKey,
        loading: false,
        error: errorMessage(nextError),
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
    setGraduatedOn({});
    setRoleDrafts({});
    setSearchKind("institution");
    setSearchText("");
    setSearchState(null);
    setMutationState(null);
  }, [authScopeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runMutation<T>(
    key: string,
    operation: (signal: AbortSignal) => Promise<T>,
    success: (result: T) => string,
  ): Promise<boolean> {
    const ticket = beginMutation();
    if (!isMutationCurrent(ticket)) return false;
    setMutationState({
      scopeKey: authScopeKey,
      busy: key,
      error: null,
      feedback: null,
    });

    try {
      const result = await operation(ticket.signal);
      if (!isMutationCurrent(ticket)) return false;
      setMutationState({
        scopeKey: authScopeKey,
        busy: key,
        error: null,
        feedback: success(result),
      });
      await loadRef.current();
      return isMutationCurrent(ticket);
    } catch (nextError) {
      if (!isMutationCurrent(ticket)) return false;
      setMutationState({
        scopeKey: authScopeKey,
        busy: key,
        error: errorMessage(nextError),
        feedback: null,
      });
      return false;
    } finally {
      if (finishMutation(ticket)) {
        setMutationState((current) =>
          current?.scopeKey === authScopeKey
            ? { ...current, busy: null }
            : current,
        );
      }
    }
  }

  const graduate = async (affiliation: AcademicAffiliation) => {
    const value = graduatedOn[affiliation.id]?.trim();
    if (!value) {
      setMutationState({
        scopeKey: authScopeKey,
        busy: null,
        error: "Indicá el período de graduación antes de confirmar.",
        feedback: null,
      });
      return;
    }

    await runMutation(
      `graduate:${affiliation.id}`,
      (signal) => academicApi.graduate(affiliation.id, value, signal),
      (result) =>
        result.transitionedSubjectCount > 0
          ? `Graduación registrada. ${result.transitionedSubjectCount} materia(s) actuales pasaron a completadas.`
          : "Graduación registrada sin perder tu historial académico.",
    );
  };

  const saveRoles = async (affiliation: AcademicAffiliation) => {
    await runMutation(
      `roles:${affiliation.id}`,
      (signal) =>
        academicApi.updateRoles(
          affiliation.id,
          roleDrafts[affiliation.id] ?? [],
          signal,
        ),
      () => "Roles de trayectoria actualizados.",
    );
  };

  const toggleRole = (
    affiliationId: string,
    role: AcademicRelationshipRole,
  ) => {
    setRoleDrafts((current) => {
      const existing = current[affiliationId] ?? [];
      return {
        ...current,
        [affiliationId]: existing.includes(role)
          ? existing.filter((item) => item !== role)
          : [...existing, role],
      };
    });
  };

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (searchText.trim().length < 2) return;

    const ticket = beginSearch();
    if (!isSearchCurrent(ticket)) return;
    setSearchState({
      scopeKey: searchScopeKey,
      busy: true,
      error: null,
      items: currentSearchState?.items ?? [],
    });

    try {
      const response = await academicApi.searchCatalog(
        searchKind,
        searchText.trim(),
        ticket.signal,
      );
      if (!isSearchCurrent(ticket)) return;
      setSearchState({
        scopeKey: searchScopeKey,
        busy: false,
        error: null,
        items: response.items,
      });
    } catch (nextError) {
      if (!isSearchCurrent(ticket)) return;
      setSearchState({
        scopeKey: searchScopeKey,
        busy: false,
        error: errorMessage(nextError),
        items: [],
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

  const follow = async (node: AcademicCatalogNode) => {
    await runMutation(
      `follow:${node.id}`,
      (signal) => academicApi.follow(node.id, signal),
      () => `Ahora seguís ${node.name}.`,
    );
  };

  const unfollow = async (nodeId: string) => {
    await runMutation(
      `unfollow:${nodeId}`,
      (signal) => academicApi.unfollow(nodeId, signal),
      () => "Seguimiento académico eliminado.",
    );
  };

  if (loading && !lifecycle) {
    return (
      <section className="academic-lifecycle-page">
        <p role="status">Preparando tu trayectoria…</p>
      </section>
    );
  }

  return (
    <section
      className="academic-lifecycle-page"
      aria-labelledby="academic-lifecycle-title"
    >
      <header className="academic-lifecycle-hero">
        <div>
          <p className="academic-lifecycle-eyebrow">Trayectoria</p>
          <h1 id="academic-lifecycle-title">
            {lifecycle ? phaseLabel(lifecycle.phase) : "Trayectoria académica"}
          </h1>
          <p>
            Tu graduación no elimina materias, afiliaciones ni vínculos. Cambia
            el contexto con el que Los Apuntes te acompaña.
          </p>
        </div>
        {lifecycle && (
          <div className="academic-lifecycle-summary">
            <span>
              <strong>{lifecycle.activeStudentAffiliationIds.length}</strong>
              afiliaciones estudiantiles activas
            </span>
            <span>
              <strong>{lifecycle.alumniAffiliationIds.length}</strong>
              afiliaciones alumni
            </span>
            <span>
              <strong>{lifecycle.currentSubjectIds.length}</strong>
              materias actuales
            </span>
          </div>
        )}
      </header>

      {feedback && (
        <p className="academic-lifecycle-success" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="academic-lifecycle-error" role="alert">
          {error}
        </p>
      )}

      <section className="academic-lifecycle-card">
        <h2>Afiliaciones e historia</h2>
        {affiliationsTruncated && (
          <p role="status">
            Mostramos hasta {affiliationLimit} afiliaciones recientes. Tu
            historia completa sigue preservada; no la usamos de forma truncada
            para decisiones de lifecycle.
          </p>
        )}
        {affiliations.length === 0 ? (
          <p>
            Todavía no tenés una afiliación académica. Cuando la agregues,
            aparecerá acá sin reemplazar las anteriores.
          </p>
        ) : (
          <div className="academic-affiliation-list">
            {affiliations.map((affiliation) => {
              const availableRoles = rolesFor(affiliation.status);
              const selected = roleDrafts[affiliation.id] ?? [];
              const graduationEligible = [
                "active",
                "paused",
                "completed",
              ].includes(affiliation.status);

              return (
                <article key={affiliation.id} className="academic-affiliation">
                  <header>
                    <div>
                      <strong>
                        {affiliation.programId
                          ? (labels[affiliation.programId] ??
                            affiliation.programId)
                          : (labels[affiliation.institutionId] ??
                            affiliation.institutionId)}
                      </strong>
                      <span>
                        {labels[affiliation.institutionId] ??
                          affiliation.institutionId}
                      </span>
                    </div>
                    <span className="academic-status">
                      {affiliation.status}
                    </span>
                  </header>

                  <fieldset>
                    <legend>Cómo te relacionás hoy con esta comunidad</legend>
                    <div className="academic-role-grid">
                      {availableRoles.map((role) => (
                        <label key={role}>
                          <input
                            type="checkbox"
                            checked={selected.includes(role)}
                            onChange={() => toggleRole(affiliation.id, role)}
                          />
                          {roleLabels[role]}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy !== null}
                      onClick={() => void saveRoles(affiliation)}
                    >
                      Guardar roles
                    </button>
                  </fieldset>

                  {graduationEligible && (
                    <div className="academic-graduation">
                      <label>
                        Período de graduación
                        <input
                          type="month"
                          value={graduatedOn[affiliation.id] ?? ""}
                          onChange={(event) =>
                            setGraduatedOn((current) => ({
                              ...current,
                              [affiliation.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <div>
                        <strong>Pasar esta afiliación a alumni</strong>
                        <p>
                          Conserva todo el historial y cierra como completadas
                          las materias actuales de este mismo alcance.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void graduate(affiliation)}
                      >
                        Registrar graduación
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="academic-lifecycle-card">
        <h2>Continuidad académica</h2>
        <p>
          Seguí instituciones o carreras porque querés mantener ese vínculo. No
          modifica tu historial ni implica matrícula o pertenencia actual.
        </p>

        {lifecycle?.followsTruncated && (
          <p role="status">
            Mostramos hasta {lifecycle.followsLimit} seguimientos en este
            resumen. Puede haber vínculos adicionales que siguen activos.
          </p>
        )}

        {lifecycle && lifecycle.follows.length > 0 && (
          <ul className="academic-follow-list">
            {lifecycle.follows.map((item) => (
              <li key={item.targetId}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.kind === "institution" ? "Institución" : "Carrera"}
                  </span>
                </div>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy !== null}
                  onClick={() => void unfollow(item.targetId)}
                >
                  Dejar de seguir
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="academic-follow-search" onSubmit={search}>
          <label>
            Buscar
            <select
              value={searchKind}
              onChange={(event) => {
                setSearchKind(event.target.value as "institution" | "program");
                setSearchState(null);
              }}
            >
              <option value="institution">Instituciones</option>
              <option value="program">Carreras</option>
            </select>
          </label>
          <label>
            Nombre
            <input
              minLength={2}
              required
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>
          <button disabled={busy !== null} type="submit">
            Buscar
          </button>
        </form>

        {results.length > 0 && (
          <ul className="academic-follow-list">
            {results.map((node) => (
              <li key={node.id}>
                <div>
                  <strong>{node.name}</strong>
                  <span>
                    {node.kind === "institution" ? "Institución" : "Carrera"}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy !== null || followedIds.has(node.id)}
                  onClick={() => void follow(node)}
                >
                  {followedIds.has(node.id) ? "Siguiendo" : "Seguir"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
};

export default AcademicLifecycle;
