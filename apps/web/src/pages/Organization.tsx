import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type { OrganizationDetail } from "../features/organizations/interfaces";
import {
  isOrganizationsApiError,
  organizationsApi,
} from "../features/organizations/services/organizationsService";
import "./Organizations.scss";

function messageFor(error: unknown): string {
  if (isOrganizationsApiError(error)) return error.message;
  return "No pudimos completar la operación.";
}

const Organization = () => {
  const { organizationId } = useParams();
  const { status } = useAuth();
  const authenticated = status === "authenticated";
  const [organization, setOrganization] = useState<OrganizationDetail | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = async () => {
    if (!organizationId) return;
    setError(null);
    try {
      const result = await organizationsApi.get(organizationId);
      setOrganization(result.organization);
    } catch (nextError) {
      if (isOrganizationsApiError(nextError) && nextError.status === 404) {
        setError("Esta organización no existe o ya no está disponible.");
        return;
      }
      setError(messageFor(nextError));
    }
  };

  useEffect(() => {
    void load();
  }, [organizationId]);

  const follow = async () => {
    if (!organization) return;
    setBusy("follow");
    setError(null);
    try {
      if (organization.viewer?.following) {
        await organizationsApi.unfollow(organization.id);
        setFeedback("Dejaste de seguir esta organización.");
      } else {
        await organizationsApi.follow(organization.id);
        setFeedback("Ahora seguís esta organización.");
      }
      await load();
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  const reportPost = async (postId: string) => {
    if (!organization) return;
    setBusy(`report-post:${postId}`);
    setError(null);
    try {
      await organizationsApi.reportPost(organization.id, postId);
      setFeedback("Reporte de publicación recibido.");
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  const reportEvent = async (eventId: string) => {
    if (!organization) return;
    setBusy(`report-event:${eventId}`);
    setError(null);
    try {
      await organizationsApi.reportEvent(organization.id, eventId);
      setFeedback("Reporte de evento recibido.");
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  if (error && !organization) {
    return (
      <section className="organizations-page">
        <p className="organizations-error" role="alert">
          {error}
        </p>
        <Link to="/organizations">Volver al directorio</Link>
      </section>
    );
  }

  if (!organization) {
    return (
      <section className="organizations-page">
        <p role="status">Cargando organización…</p>
      </section>
    );
  }

  return (
    <section
      className="organizations-page"
      aria-labelledby="organization-title"
    >
      <header className="organizations-hero organization-public-hero">
        <div>
          <p className="organizations-eyebrow">
            {organization.scope.institution.name}
          </p>
          <h1 id="organization-title">{organization.name}</h1>
          <p>{organization.about ?? "Sin descripción pública todavía."}</p>
          <div className="organization-badges">
            <span>{organization.type.replaceAll("_", " ")}</span>
            <span>
              {organization.verificationState === "verified"
                ? "Identidad verificada"
                : "Claim sin verificar"}
            </span>
            <span>{organization.followerCount} seguidores</span>
          </div>
        </div>
        <div className="organization-header-actions">
          {authenticated ? (
            <button
              type="button"
              disabled={busy === "follow"}
              onClick={() => void follow()}
            >
              {organization.viewer?.following
                ? "Dejar de seguir"
                : "Seguir organización"}
            </button>
          ) : (
            <Link to="/login">Iniciar sesión para seguir</Link>
          )}
          {organization.viewer?.managementRole && (
            <Link to={`/organizations/${organization.id}/manage`}>
              Administrar
            </Link>
          )}
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

      <div className="organizations-grid">
        <section className="organizations-card">
          <h2>Contexto</h2>
          <p>
            <strong>Institución:</strong> {organization.scope.institution.name}
          </p>
          {organization.scope.campus && (
            <p>
              <strong>Sede:</strong> {organization.scope.campus.name}
            </p>
          )}
          {organization.scope.academicUnit && (
            <p>
              <strong>Unidad académica:</strong>{" "}
              {organization.scope.academicUnit.name}
            </p>
          )}
          {organization.scope.program && (
            <p>
              <strong>Carrera:</strong> {organization.scope.program.name}
            </p>
          )}
          {organization.websiteUrl && (
            <a href={organization.websiteUrl} target="_blank" rel="noreferrer">
              Sitio de la organización
            </a>
          )}
        </section>

        <section className="organizations-card">
          <h2>Managers</h2>
          <ul className="organization-compact-list">
            {organization.managers.map((manager, index) => (
              <li key={manager.profile.profileId ?? `${manager.role}:${index}`}>
                <strong>{manager.profile.displayName}</strong>
                <span>{manager.role}</span>
              </li>
            ))}
          </ul>
          <small>
            La verificación de la organización no convierte a todos sus miembros
            en managers.
          </small>
        </section>

        <section className="organizations-card organizations-wide">
          <h2>Publicaciones</h2>
          {organization.posts.length === 0 ? (
            <p>No hay publicaciones todavía.</p>
          ) : (
            <div className="organization-content-list">
              {organization.posts.map((post) => (
                <article key={post.id}>
                  <span className="organization-source">
                    Fuente: {organization.name}
                  </span>
                  <h3>{post.title ?? "Publicación"}</h3>
                  <p>{post.body}</p>
                  {post.academic?.subject && (
                    <small>Materia: {post.academic.subject.name}</small>
                  )}
                  {authenticated && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy === `report-post:${post.id}`}
                      onClick={() => void reportPost(post.id)}
                    >
                      Reportar
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="organizations-card organizations-wide">
          <h2>Eventos</h2>
          {organization.events.length === 0 ? (
            <p>No hay eventos publicados.</p>
          ) : (
            <div className="organization-content-list">
              {organization.events.map((event) => (
                <article key={event.id}>
                  <h3>{event.title}</h3>
                  {event.description && <p>{event.description}</p>}
                  <p>
                    <time dateTime={event.startsAt}>
                      {new Date(event.startsAt).toLocaleString("es-AR")}
                    </time>
                    {event.endsAt && (
                      <> → {new Date(event.endsAt).toLocaleString("es-AR")}</>
                    )}
                  </p>
                  {event.locationLabel && <p>{event.locationLabel}</p>}
                  {event.externalUrl && (
                    <a
                      href={event.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Más información
                    </a>
                  )}
                  {authenticated && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy === `report-event:${event.id}`}
                      onClick={() => void reportEvent(event.id)}
                    >
                      Reportar
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        {organization.links.length > 0 && (
          <section className="organizations-card">
            <h2>Links útiles</h2>
            <ul>
              {organization.links.map((link) => (
                <li key={link.id}>
                  <a href={link.url} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {organization.featuredResources.length > 0 && (
          <section className="organizations-card">
            <h2>Recursos destacados</h2>
            <ul>
              {organization.featuredResources.map((resource) => (
                <li key={resource.id}>
                  <Link
                    to={`/resources?q=${encodeURIComponent(
                      resource.title,
                    )}&subjectId=${encodeURIComponent(
                      resource.academic.subject.id,
                    )}`}
                  >
                    {resource.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
};

export default Organization;
