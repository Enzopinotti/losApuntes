import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type { OrganizationDetail } from "../features/organizations/interfaces";
import { organizationContentCursorRepeats } from "../features/organizations/contentPagination";
import {
  isOrganizationsApiError,
  organizationsApi,
} from "../features/organizations/services/organizationsService";
import { serializeOrganizationEventCalendar } from "../features/organizations/organization-event-calendar.mjs";
import { AuthorProfileLink } from "../features/profile/AuthorProfileLink";
import {
  feedReturnHref,
  feedReturnRestoreState,
} from "../features/feeds/feed-navigation.mjs";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./Organizations.scss";

function appendPosts(
  current: OrganizationDetail["posts"],
  next: OrganizationDetail["posts"],
) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}

function appendEvents(
  current: OrganizationDetail["events"],
  next: OrganizationDetail["events"],
) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}

function messageFor(error: unknown): string {
  if (isOrganizationsApiError(error)) return error.message;
  return "No pudimos completar la operación.";
}

function downloadOrganizationEventCalendar(
  event: OrganizationDetail["events"][number],
) {
  const calendar = serializeOrganizationEventCalendar(event);
  if (!calendar) return;

  const filename =
    event.title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, 60) || "evento";
  const objectUrl = URL.createObjectURL(
    new Blob([calendar], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${filename}.ics`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

const Organization = () => {
  const { organizationId } = useParams();
  const location = useLocation();
  const { status, user, session } = useAuth();
  const feedReturnTo = feedReturnHref(location.state);
  const feedReturnLink = feedReturnTo ? (
    <Link
      className="organization-feed-return"
      to={feedReturnTo}
      state={feedReturnRestoreState(location.state)}
      replace
    >
      {feedReturnTo === "/" ? "Volver a Inicio" : "Volver al feed"}
    </Link>
  ) : (
    <Link className="organization-feed-return" to="/organizations">
      Volver al directorio
    </Link>
  );
  const authenticated = status === "authenticated";
  const authScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const organizationScopeKey = [
    organizationId ?? "missing-organization",
    authScopeKey,
  ].join(":");
  const {
    begin: beginLoad,
    isCurrent: isLoadCurrent,
    finish: finishLoad,
  } = useAsyncAuthorityFence(`organization-load:${organizationScopeKey}`);
  const {
    begin: beginAction,
    isCurrent: isActionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(`organization-action:${organizationScopeKey}`);
  const [organizationState, setOrganizationState] = useState<{
    scopeKey: string;
    organization: OrganizationDetail;
  } | null>(null);
  const organization =
    organizationState?.scopeKey === organizationScopeKey
      ? organizationState.organization
      : null;
  const [busyState, setBusyState] = useState<{
    scopeKey: string;
    value: string | null;
  } | null>(null);
  const busy =
    busyState?.scopeKey === organizationScopeKey ? busyState.value : null;
  const [errorState, setErrorState] = useState<{
    scopeKey: string;
    message: string;
  } | null>(null);
  const error =
    errorState?.scopeKey === organizationScopeKey ? errorState.message : null;
  const [feedbackState, setFeedbackState] = useState<{
    scopeKey: string;
    message: string;
  } | null>(null);
  const feedback =
    feedbackState?.scopeKey === organizationScopeKey
      ? feedbackState.message
      : null;
  const [cursorIssueState, setCursorIssueState] = useState<{
    scopeKey: string;
    posts: boolean;
    events: boolean;
  } | null>(null);
  const currentCursorIssues =
    cursorIssueState?.scopeKey === organizationScopeKey
      ? cursorIssueState
      : null;
  const postsCursorIssue = currentCursorIssues?.posts ?? false;
  const eventsCursorIssue = currentCursorIssues?.events ?? false;
  const loadedContentCursors = useRef({
    scopeKey: organizationScopeKey,
    posts: new Set<string>(),
    events: new Set<string>(),
  });

  const load = useCallback(async () => {
    if (!organizationId) return;
    const ticket = beginLoad();
    if (!isLoadCurrent(ticket)) return;
    setErrorState(null);
    try {
      const result = await organizationsApi.get(organizationId, ticket.signal);
      if (!isLoadCurrent(ticket)) return;
      loadedContentCursors.current = {
        scopeKey: organizationScopeKey,
        posts: new Set(),
        events: new Set(),
      };
      setCursorIssueState(null);
      setOrganizationState({
        scopeKey: organizationScopeKey,
        organization: result.organization,
      });
    } catch (nextError) {
      if (!isLoadCurrent(ticket)) return;
      setErrorState({
        scopeKey: organizationScopeKey,
        message:
          isOrganizationsApiError(nextError) && nextError.status === 404
            ? "Esta organización no existe o ya no está disponible."
            : messageFor(nextError),
      });
    } finally {
      finishLoad(ticket);
    }
  }, [
    beginLoad,
    finishLoad,
    isLoadCurrent,
    organizationId,
    organizationScopeKey,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const follow = async () => {
    if (!organization) return;
    const target = organization;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    setBusyState({ scopeKey: organizationScopeKey, value: "follow" });
    setErrorState(null);
    setFeedbackState(null);
    try {
      if (target.viewer?.following) {
        await organizationsApi.unfollow(target.id, ticket.signal);
        if (!isActionCurrent(ticket)) return;
        setFeedbackState({
          scopeKey: organizationScopeKey,
          message: "Dejaste de seguir esta organización.",
        });
      } else {
        await organizationsApi.follow(target.id, ticket.signal);
        if (!isActionCurrent(ticket)) return;
        setFeedbackState({
          scopeKey: organizationScopeKey,
          message: "Ahora seguís esta organización.",
        });
      }
      await load();
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setErrorState({
        scopeKey: organizationScopeKey,
        message: messageFor(nextError),
      });
    } finally {
      if (finishAction(ticket)) {
        setBusyState({ scopeKey: organizationScopeKey, value: null });
      }
    }
  };

  const loadMorePosts = async () => {
    if (!organization?.postsNextCursor) return;
    const target = organization;
    const requestedCursor = target.postsNextCursor;
    if (!requestedCursor) return;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    setBusyState({ scopeKey: organizationScopeKey, value: "posts-more" });
    setErrorState(null);

    try {
      const page = await organizationsApi.posts(
        target.id,
        requestedCursor,
        ticket.signal,
      );
      if (!isActionCurrent(ticket)) return;
      const cursorState = loadedContentCursors.current;
      const loadedCursors =
        cursorState.scopeKey === organizationScopeKey
          ? cursorState.posts
          : new Set<string>();
      if (
        organizationContentCursorRepeats(
          loadedCursors,
          requestedCursor,
          page.nextCursor,
        )
      ) {
        setOrganizationState((current) =>
          current?.scopeKey === organizationScopeKey &&
          current.organization.id === target.id
            ? {
                scopeKey: organizationScopeKey,
                organization: {
                  ...current.organization,
                  posts: appendPosts(current.organization.posts, page.items),
                  postsNextCursor: null,
                },
              }
            : current,
        );
        setCursorIssueState((previous) => ({
          scopeKey: organizationScopeKey,
          posts: true,
          events:
            previous?.scopeKey === organizationScopeKey
              ? previous.events
              : false,
        }));
        return;
      }
      loadedCursors.add(requestedCursor);
      loadedContentCursors.current = {
        scopeKey: organizationScopeKey,
        posts: loadedCursors,
        events:
          cursorState.scopeKey === organizationScopeKey
            ? cursorState.events
            : new Set(),
      };
      setOrganizationState((current) =>
        current?.scopeKey === organizationScopeKey &&
        current.organization.id === target.id
          ? {
              scopeKey: organizationScopeKey,
              organization: {
                ...current.organization,
                posts: appendPosts(current.organization.posts, page.items),
                postsNextCursor: page.nextCursor,
              },
            }
          : current,
      );
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setErrorState({
        scopeKey: organizationScopeKey,
        message: messageFor(nextError),
      });
    } finally {
      if (finishAction(ticket)) {
        setBusyState({ scopeKey: organizationScopeKey, value: null });
      }
    }
  };

  const refreshPosts = async () => {
    if (!organization || busy) return;
    const target = organization;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    setBusyState({ scopeKey: organizationScopeKey, value: "posts-refresh" });
    setErrorState(null);

    try {
      const page = await organizationsApi.posts(
        target.id,
        undefined,
        ticket.signal,
      );
      if (!isActionCurrent(ticket)) return;
      const cursorState = loadedContentCursors.current;
      loadedContentCursors.current = {
        scopeKey: organizationScopeKey,
        posts: new Set(),
        events:
          cursorState.scopeKey === organizationScopeKey
            ? cursorState.events
            : new Set(),
      };
      setOrganizationState((current) =>
        current?.scopeKey === organizationScopeKey &&
        current.organization.id === target.id
          ? {
              scopeKey: organizationScopeKey,
              organization: {
                ...current.organization,
                posts: appendPosts([], page.items),
                postsNextCursor: page.nextCursor,
              },
            }
          : current,
      );
      setCursorIssueState((previous) => ({
        scopeKey: organizationScopeKey,
        posts: false,
        events:
          previous?.scopeKey === organizationScopeKey ? previous.events : false,
      }));
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setErrorState({
        scopeKey: organizationScopeKey,
        message: messageFor(nextError),
      });
    } finally {
      if (finishAction(ticket)) {
        setBusyState({ scopeKey: organizationScopeKey, value: null });
      }
    }
  };

  const loadMoreEvents = async () => {
    if (!organization?.eventsNextCursor) return;
    const target = organization;
    const requestedCursor = target.eventsNextCursor;
    if (!requestedCursor) return;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    setBusyState({ scopeKey: organizationScopeKey, value: "events-more" });
    setErrorState(null);

    try {
      const page = await organizationsApi.events(
        target.id,
        requestedCursor,
        ticket.signal,
      );
      if (!isActionCurrent(ticket)) return;
      const cursorState = loadedContentCursors.current;
      const loadedCursors =
        cursorState.scopeKey === organizationScopeKey
          ? cursorState.events
          : new Set<string>();
      if (
        organizationContentCursorRepeats(
          loadedCursors,
          requestedCursor,
          page.nextCursor,
        )
      ) {
        setOrganizationState((current) =>
          current?.scopeKey === organizationScopeKey &&
          current.organization.id === target.id
            ? {
                scopeKey: organizationScopeKey,
                organization: {
                  ...current.organization,
                  events: appendEvents(current.organization.events, page.items),
                  eventsNextCursor: null,
                },
              }
            : current,
        );
        setCursorIssueState((previous) => ({
          scopeKey: organizationScopeKey,
          posts:
            previous?.scopeKey === organizationScopeKey
              ? previous.posts
              : false,
          events: true,
        }));
        return;
      }
      loadedCursors.add(requestedCursor);
      loadedContentCursors.current = {
        scopeKey: organizationScopeKey,
        posts:
          cursorState.scopeKey === organizationScopeKey
            ? cursorState.posts
            : new Set(),
        events: loadedCursors,
      };
      setOrganizationState((current) =>
        current?.scopeKey === organizationScopeKey &&
        current.organization.id === target.id
          ? {
              scopeKey: organizationScopeKey,
              organization: {
                ...current.organization,
                events: appendEvents(current.organization.events, page.items),
                eventsNextCursor: page.nextCursor,
              },
            }
          : current,
      );
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setErrorState({
        scopeKey: organizationScopeKey,
        message: messageFor(nextError),
      });
    } finally {
      if (finishAction(ticket)) {
        setBusyState({ scopeKey: organizationScopeKey, value: null });
      }
    }
  };

  const refreshEvents = async () => {
    if (!organization || busy) return;
    const target = organization;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    setBusyState({ scopeKey: organizationScopeKey, value: "events-refresh" });
    setErrorState(null);

    try {
      const page = await organizationsApi.events(
        target.id,
        undefined,
        ticket.signal,
      );
      if (!isActionCurrent(ticket)) return;
      const cursorState = loadedContentCursors.current;
      loadedContentCursors.current = {
        scopeKey: organizationScopeKey,
        posts:
          cursorState.scopeKey === organizationScopeKey
            ? cursorState.posts
            : new Set(),
        events: new Set(),
      };
      setOrganizationState((current) =>
        current?.scopeKey === organizationScopeKey &&
        current.organization.id === target.id
          ? {
              scopeKey: organizationScopeKey,
              organization: {
                ...current.organization,
                events: appendEvents([], page.items),
                eventsNextCursor: page.nextCursor,
              },
            }
          : current,
      );
      setCursorIssueState((previous) => ({
        scopeKey: organizationScopeKey,
        posts:
          previous?.scopeKey === organizationScopeKey ? previous.posts : false,
        events: false,
      }));
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setErrorState({
        scopeKey: organizationScopeKey,
        message: messageFor(nextError),
      });
    } finally {
      if (finishAction(ticket)) {
        setBusyState({ scopeKey: organizationScopeKey, value: null });
      }
    }
  };

  const reportPost = async (postId: string) => {
    if (!organization) return;
    const target = organization;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    setBusyState({
      scopeKey: organizationScopeKey,
      value: `report-post:${postId}`,
    });
    setErrorState(null);
    setFeedbackState(null);
    try {
      await organizationsApi.reportPost(target.id, postId, ticket.signal);
      if (!isActionCurrent(ticket)) return;
      setFeedbackState({
        scopeKey: organizationScopeKey,
        message: "Reporte de publicación recibido.",
      });
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setErrorState({
        scopeKey: organizationScopeKey,
        message: messageFor(nextError),
      });
    } finally {
      if (finishAction(ticket)) {
        setBusyState({ scopeKey: organizationScopeKey, value: null });
      }
    }
  };

  const reportEvent = async (eventId: string) => {
    if (!organization) return;
    const target = organization;
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return;
    setBusyState({
      scopeKey: organizationScopeKey,
      value: `report-event:${eventId}`,
    });
    setErrorState(null);
    setFeedbackState(null);
    try {
      await organizationsApi.reportEvent(target.id, eventId, ticket.signal);
      if (!isActionCurrent(ticket)) return;
      setFeedbackState({
        scopeKey: organizationScopeKey,
        message: "Reporte de evento recibido.",
      });
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setErrorState({
        scopeKey: organizationScopeKey,
        message: messageFor(nextError),
      });
    } finally {
      if (finishAction(ticket)) {
        setBusyState({ scopeKey: organizationScopeKey, value: null });
      }
    }
  };

  if (error && !organization) {
    return (
      <section className="organizations-page">
        {feedReturnLink}
        <p className="organizations-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!organization) {
    return (
      <section className="organizations-page">
        {feedReturnLink}
        <p role="status">Cargando organización…</p>
      </section>
    );
  }

  return (
    <section
      className="organizations-page"
      aria-labelledby="organization-title"
    >
      {feedReturnLink}
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
                <strong>
                  <AuthorProfileLink
                    profileId={manager.profile.profileId}
                    displayName={manager.profile.displayName}
                  />
                </strong>
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
          {organization.postsNextCursor && (
            <button
              type="button"
              className="secondary"
              disabled={busy === "posts-more"}
              onClick={() => void loadMorePosts()}
            >
              {busy === "posts-more" ? "Cargando…" : "Cargar más publicaciones"}
            </button>
          )}
          {postsCursorIssue && (
            <>
              <p className="organizations-error" role="alert">
                Recibimos una publicación repetida y detuvimos la lista. Se
                conservaron las publicaciones cargadas.
              </p>
              <button
                type="button"
                className="secondary"
                disabled={busy !== null}
                onClick={() => void refreshPosts()}
              >
                {busy === "posts-refresh"
                  ? "Actualizando…"
                  : "Actualizar publicaciones"}
              </button>
            </>
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
                  {event.state === "cancelled" ? (
                    <p className="organization-event-cancelled">
                      Evento cancelado
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="secondary organization-event-calendar"
                      onClick={() => downloadOrganizationEventCalendar(event)}
                      aria-label={`Descargar calendario para ${event.title}`}
                    >
                      Descargar .ics
                    </button>
                  )}
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
          {organization.eventsNextCursor && (
            <button
              type="button"
              className="secondary"
              disabled={busy === "events-more"}
              onClick={() => void loadMoreEvents()}
            >
              {busy === "events-more" ? "Cargando…" : "Cargar más eventos"}
            </button>
          )}
          {eventsCursorIssue && (
            <>
              <p className="organizations-error" role="alert">
                Recibimos un evento repetido y detuvimos la lista. Se
                conservaron los eventos cargados.
              </p>
              <button
                type="button"
                className="secondary"
                disabled={busy !== null}
                onClick={() => void refreshEvents()}
              >
                {busy === "events-refresh"
                  ? "Actualizando…"
                  : "Actualizar eventos"}
              </button>
            </>
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
