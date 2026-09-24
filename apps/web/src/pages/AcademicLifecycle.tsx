import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
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
  return error.message;
}

const AcademicLifecycle = () => {
  const [lifecycle, setLifecycle] = useState<AcademicLifecycleResponse | null>(
    null,
  );
  const [affiliations, setAffiliations] = useState<AcademicAffiliation[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [graduatedOn, setGraduatedOn] = useState<Record<string, string>>({});
  const [roleDrafts, setRoleDrafts] = useState<
    Record<string, AcademicRelationshipRole[]>
  >({});
  const [searchKind, setSearchKind] = useState<"institution" | "program">(
    "institution",
  );
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<AcademicCatalogNode[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const followedIds = useMemo(
    () => new Set(lifecycle?.follows.map((item) => item.targetId) ?? []),
    [lifecycle],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextLifecycle, affiliationResponse] = await Promise.all([
        academicApi.lifecycle(),
        academicApi.affiliations(),
      ]);
      setLifecycle(nextLifecycle);
      setAffiliations(affiliationResponse.affiliations);
      setRoleDrafts(
        Object.fromEntries(
          affiliationResponse.affiliations.map((row) => [row.id, row.roles]),
        ),
      );

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
            const result = await academicApi.node(id);
            return [id, result.node.name] as const;
          } catch {
            return [id, id] as const;
          }
        }),
      );
      setLabels(Object.fromEntries(entries));
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const graduate = async (affiliation: AcademicAffiliation) => {
    const value = graduatedOn[affiliation.id]?.trim();
    if (!value) {
      setError("Indicá el período de graduación antes de confirmar.");
      return;
    }

    setBusy(`graduate:${affiliation.id}`);
    setError(null);
    setFeedback(null);

    try {
      const result = await academicApi.graduate(affiliation.id, value);
      setFeedback(
        result.transitionedSubjectCount > 0
          ? `Graduación registrada. ${result.transitionedSubjectCount} materia(s) actuales pasaron a completadas.`
          : "Graduación registrada sin perder tu historial académico.",
      );
      await load();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(null);
    }
  };

  const saveRoles = async (affiliation: AcademicAffiliation) => {
    setBusy(`roles:${affiliation.id}`);
    setError(null);
    setFeedback(null);

    try {
      await academicApi.updateRoles(
        affiliation.id,
        roleDrafts[affiliation.id] ?? [],
      );
      setFeedback("Roles de trayectoria actualizados.");
      await load();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(null);
    }
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

    setBusy("search");
    setError(null);

    try {
      const response = await academicApi.searchCatalog(
        searchKind,
        searchText.trim(),
      );
      setResults(response.items);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(null);
    }
  };

  const follow = async (node: AcademicCatalogNode) => {
    setBusy(`follow:${node.id}`);
    setError(null);

    try {
      await academicApi.follow(node.id);
      setFeedback(`Ahora seguís ${node.name}.`);
      await load();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(null);
    }
  };

  const unfollow = async (nodeId: string) => {
    setBusy(`unfollow:${nodeId}`);
    setError(null);

    try {
      await academicApi.unfollow(nodeId);
      setFeedback("Seguimiento académico eliminado.");
      await load();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(null);
    }
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
                setResults([]);
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
