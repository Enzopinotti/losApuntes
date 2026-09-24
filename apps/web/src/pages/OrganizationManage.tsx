import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  OrganizationDetail,
  OrganizationManagement,
  OrganizationManagerRole,
} from "../features/organizations/interfaces";
import {
  isOrganizationsApiError,
  organizationsApi,
} from "../features/organizations/services/organizationsService";
import "./Organizations.scss";

function messageFor(error: unknown): string {
  if (!isOrganizationsApiError(error)) {
    return "No pudimos completar la operación.";
  }
  if (error.code === "ORGANIZATION_MANAGEMENT_REVISION_CONFLICT") {
    return "Los permisos cambiaron en otra pestaña. Recargá antes de continuar.";
  }
  if (error.code === "ORGANIZATION_FINAL_OWNER_REQUIRED") {
    return "La organización debe conservar al menos un owner.";
  }
  if (error.code === "ORGANIZATION_MANAGER_ROLE_FORBIDDEN") {
    return "Tu rol no permite modificar owners.";
  }
  if (error.code === "ORGANIZATION_VERIFICATION_FORBIDDEN") {
    return "La verificación requiere permiso de plataforma.";
  }
  return error.message;
}

const OrganizationManage = () => {
  const { organizationId } = useParams();
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [management, setManagement] = useState<OrganizationManagement | null>(
    null,
  );
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventEndsAt, setEventEndsAt] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [managerProfileId, setManagerProfileId] = useState("");
  const [managerRole, setManagerRole] =
    useState<OrganizationManagerRole>("editor");
  const [managerReason, setManagerReason] = useState("");
  const [verificationReason, setVerificationReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setError(null);
    try {
      const [publicResult, managementResult] = await Promise.all([
        organizationsApi.get(organizationId),
        organizationsApi.management(organizationId),
      ]);
      setDetail(publicResult.organization);
      setManagement(managementResult);
      setName(publicResult.organization.name);
      setAbout(publicResult.organization.about ?? "");
      setWebsiteUrl(publicResult.organization.websiteUrl ?? "");
    } catch (nextError) {
      setError(messageFor(nextError));
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (
    key: string,
    operation: () => Promise<unknown>,
    success: string,
  ) => {
    setBusy(key);
    setError(null);
    setFeedback(null);
    try {
      await operation();
      setFeedback(success);
      await load();
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail) return;
    await run(
      "profile",
      () =>
        organizationsApi.update(detail.id, detail.revision, {
          name,
          about: about.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
        }),
      "Organización actualizada.",
    );
  };

  const publishPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail) return;
    await run(
      "post",
      () =>
        organizationsApi.createPost(detail.id, {
          title: postTitle.trim() || undefined,
          body: postBody,
        }),
      "Publicación creada.",
    );
    setPostTitle("");
    setPostBody("");
  };

  const publishEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail) return;
    await run(
      "event",
      () =>
        organizationsApi.createEvent(detail.id, {
          title: eventTitle,
          description: eventDescription.trim() || undefined,
          startsAt: new Date(eventStartsAt).toISOString(),
          endsAt: eventEndsAt ? new Date(eventEndsAt).toISOString() : undefined,
        }),
      "Evento publicado.",
    );
    setEventTitle("");
    setEventDescription("");
    setEventStartsAt("");
    setEventEndsAt("");
  };

  if (!detail || !management) {
    return (
      <section className="organizations-page">
        {error ? (
          <p className="organizations-error" role="alert">
            {error}
          </p>
        ) : (
          <p role="status">Cargando gestión…</p>
        )}
        <Link to="/organizations">Volver a organizaciones</Link>
      </section>
    );
  }

  const canManageOwners = management.actorRole === "owner";

  return (
    <section className="organizations-page" aria-labelledby="org-manage-title">
      <header className="organizations-hero">
        <div>
          <p className="organizations-eyebrow">Gestión auditable</p>
          <h1 id="org-manage-title">{detail.name}</h1>
          <p>
            Rol actual: <strong>{management.actorRole}</strong>. Verificación y
            management son autoridades distintas.
          </p>
        </div>
        <Link to={`/organizations/${detail.id}`}>Ver página pública</Link>
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
        {(management.actorRole === "owner" ||
          management.actorRole === "admin") && (
          <section className="organizations-card">
            <h2>Perfil</h2>
            <form onSubmit={saveProfile} className="organizations-form">
              <label>
                Nombre
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="organizations-wide">
                Acerca de
                <textarea
                  rows={4}
                  value={about}
                  onChange={(event) => setAbout(event.target.value)}
                />
              </label>
              <label className="organizations-wide">
                Sitio HTTPS
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(event) => setWebsiteUrl(event.target.value)}
                />
              </label>
              <button disabled={busy === "profile"} type="submit">
                Guardar
              </button>
            </form>
          </section>
        )}

        <section className="organizations-card">
          <h2>Managers</h2>
          <ul className="organization-compact-list">
            {management.managers.map((manager, index) => (
              <li key={manager.profile.profileId ?? `${manager.role}:${index}`}>
                <span>
                  <strong>{manager.profile.displayName}</strong> ·{" "}
                  {manager.role}
                </span>
                {manager.profile.profileId && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      Boolean(busy) ||
                      (!canManageOwners && manager.role === "owner")
                    }
                    onClick={() =>
                      void run(
                        `remove:${manager.profile.profileId}`,
                        () =>
                          organizationsApi.removeManager(
                            detail.id,
                            manager.profile.profileId!,
                            management.organization.managementRevision,
                            "Revocado desde gestión Web",
                          ),
                        "Manager revocado.",
                      )
                    }
                  >
                    Revocar
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="organization-manager-form">
            <input
              placeholder="UUID público del perfil"
              value={managerProfileId}
              onChange={(event) => setManagerProfileId(event.target.value)}
            />
            <select
              value={managerRole}
              onChange={(event) =>
                setManagerRole(event.target.value as OrganizationManagerRole)
              }
            >
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
              {canManageOwners && <option value="owner">Owner</option>}
            </select>
            <input
              placeholder="Razón del cambio"
              value={managerReason}
              onChange={(event) => setManagerReason(event.target.value)}
            />
            <button
              type="button"
              disabled={Boolean(busy) || !managerProfileId || !managerReason}
              onClick={() =>
                void run(
                  "manager",
                  () =>
                    organizationsApi.changeManager(
                      detail.id,
                      managerProfileId.trim(),
                      managerRole,
                      management.organization.managementRevision,
                      managerReason,
                    ),
                  "Permiso actualizado.",
                )
              }
            >
              Aplicar rol
            </button>
          </div>
        </section>

        <section className="organizations-card">
          <h2>Nueva publicación</h2>
          <form onSubmit={publishPost} className="organizations-form">
            <label>
              Título opcional
              <input
                value={postTitle}
                onChange={(event) => setPostTitle(event.target.value)}
              />
            </label>
            <label className="organizations-wide">
              Contenido
              <textarea
                required
                rows={5}
                value={postBody}
                onChange={(event) => setPostBody(event.target.value)}
              />
            </label>
            <button disabled={busy === "post"} type="submit">
              Publicar
            </button>
          </form>
        </section>

        <section className="organizations-card">
          <h2>Nuevo evento</h2>
          <form onSubmit={publishEvent} className="organizations-form">
            <label>
              Título
              <input
                required
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
              />
            </label>
            <label>
              Inicio
              <input
                type="datetime-local"
                required
                value={eventStartsAt}
                onChange={(event) => setEventStartsAt(event.target.value)}
              />
            </label>
            <label>
              Fin
              <input
                type="datetime-local"
                value={eventEndsAt}
                onChange={(event) => setEventEndsAt(event.target.value)}
              />
            </label>
            <label className="organizations-wide">
              Descripción
              <textarea
                rows={3}
                value={eventDescription}
                onChange={(event) => setEventDescription(event.target.value)}
              />
            </label>
            <button disabled={busy === "event"} type="submit">
              Publicar evento
            </button>
          </form>
        </section>

        <section className="organizations-card">
          <h2>Link útil</h2>
          <div className="organization-manager-form">
            <input
              placeholder="Etiqueta"
              value={linkLabel}
              onChange={(event) => setLinkLabel(event.target.value)}
            />
            <input
              type="url"
              placeholder="https://..."
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
            />
            <button
              type="button"
              disabled={Boolean(busy) || !linkLabel || !linkUrl}
              onClick={() =>
                void run(
                  "link",
                  () =>
                    organizationsApi.createLink(detail.id, {
                      label: linkLabel,
                      url: linkUrl,
                    }),
                  "Link agregado.",
                )
              }
            >
              Agregar link
            </button>
          </div>
        </section>

        <section className="organizations-card">
          <h2>Destacar Resource público</h2>
          <div className="organization-manager-form">
            <input
              placeholder="UUID del Resource"
              value={resourceId}
              onChange={(event) => setResourceId(event.target.value)}
            />
            <button
              type="button"
              disabled={Boolean(busy) || !resourceId}
              onClick={() =>
                void run(
                  "resource",
                  () =>
                    organizationsApi.featureResource(
                      detail.id,
                      resourceId.trim(),
                    ),
                  "Resource destacado.",
                )
              }
            >
              Destacar
            </button>
          </div>
          <small>
            Solo Resources que continúen siendo públicos aparecerán en la
            página.
          </small>
        </section>

        <section className="organizations-card">
          <h2>Verificación de identidad</h2>
          <p>
            Estado: <strong>{detail.verificationState}</strong>. Esta acción
            requiere permiso de plataforma y no implica endorsement.
          </p>
          <div className="organization-manager-form">
            <input
              placeholder="Razón / evidencia revisada"
              value={verificationReason}
              onChange={(event) => setVerificationReason(event.target.value)}
            />
            <button
              type="button"
              className="secondary"
              disabled={Boolean(busy) || !verificationReason}
              onClick={() =>
                void run(
                  "verification",
                  () =>
                    organizationsApi.updateVerification(
                      detail.id,
                      detail.revision,
                      detail.verificationState === "verified"
                        ? "unverified"
                        : "verified",
                      verificationReason,
                    ),
                  "Estado de verificación actualizado.",
                )
              }
            >
              {detail.verificationState === "verified"
                ? "Quitar verificación"
                : "Verificar identidad"}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
};

export default OrganizationManage;
