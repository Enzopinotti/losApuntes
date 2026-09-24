import {
  useCallback,
  useEffect,
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
import {
  isOrganizationsApiError,
  organizationsApi,
} from "../features/organizations/services/organizationsService";
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

const Organizations = () => {
  const { status } = useAuth();
  const authenticated = status === "authenticated";
  const [items, setItems] = useState<OrganizationCard[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<OrganizationType | "">("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [createType, setCreateType] =
    useState<OrganizationType>("student_center");
  const [about, setAbout] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [institutionQuery, setInstitutionQuery] = useState("");
  const [institutions, setInstitutions] = useState<AcademicInstitutionOption[]>(
    [],
  );
  const [institution, setInstitution] =
    useState<AcademicInstitutionOption | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await organizationsApi.search({
        q: query.trim() || undefined,
        type: type || undefined,
      });
      setItems(result.items);
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setLoading(false);
    }
  }, [query, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchInstitutions = async () => {
    if (institutionQuery.trim().length < 2) return;
    setError(null);
    try {
      setInstitutions(
        await organizationsApi.searchInstitutions(institutionQuery.trim()),
      );
    } catch (nextError) {
      setError(messageFor(nextError));
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!institution) return;

    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await organizationsApi.create({
        name,
        type: createType,
        institutionId: institution.id,
        about: about.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
      });
      setName("");
      setAbout("");
      setWebsiteUrl("");
      setInstitution(null);
      setInstitutionQuery("");
      setInstitutions([]);
      setFeedback(
        `Organización creada: ${result.organization.name}. Empieza sin verificación institucional.`,
      );
      await load();
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="organizations-page" aria-labelledby="organizations-title">
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

      <section className="organizations-list" aria-live="polite">
        {loading ? (
          <p>Cargando organizaciones…</p>
        ) : items.length === 0 ? (
          <p>No encontramos organizaciones con esos filtros.</p>
        ) : (
          items.map((item) => (
            <article className="organization-card" key={item.id}>
              <div>
                <span className="organization-type">{typeLabels[item.type]}</span>
                <h2>{item.name}</h2>
                <p>{item.institution.name}</p>
                <span className="organization-verification">
                  {item.verificationState === "verified"
                    ? "Identidad verificada"
                    : "Claim sin verificar"}
                </span>
              </div>
              <Link to={`/organizations/${item.id}`}>Ver organización</Link>
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
                        onClick={() => setInstitution(option)}
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
