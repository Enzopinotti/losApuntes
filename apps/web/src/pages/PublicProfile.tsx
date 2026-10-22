import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  ProfileActivity,
  PublicProfileResponse,
} from "../features/profile/interfaces";
import { activityCursorRepeats } from "../features/profile/activityPagination";
import {
  isProfileApiError,
  profileApi,
} from "../features/profile/services/profileService";
import { PublicProfileSocialActions } from "../features/community/public-profile-social-actions";
import {
  feedReturnHref,
  feedReturnRestoreState,
} from "../features/feeds/feed-navigation.mjs";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
import "./Profile.scss";

function appendActivities(
  current: ProfileActivity[],
  next: ProfileActivity[],
): ProfileActivity[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}

const PublicProfile = () => {
  const { profileId } = useParams();
  const location = useLocation();
  const { status, user, session } = useAuth();
  const feedReturnTo = feedReturnHref(location.state);
  const feedReturnState = feedReturnRestoreState(location.state);
  const feedReturnLink = feedReturnTo ? (
    <Link
      className="public-profile-feed-return"
      to={feedReturnTo}
      state={feedReturnState}
      replace
    >
      {feedReturnTo === "/" ? "Volver a Inicio" : "Volver al feed"}
    </Link>
  ) : null;
  const viewerScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const profileScopeKey = [profileId ?? "missing-profile", viewerScopeKey].join(
    ":",
  );
  const {
    begin: beginLoad,
    isCurrent: isLoadCurrent,
    finish: finishLoad,
  } = useAsyncAuthorityFence(`public-profile-load:${profileScopeKey}`);
  const {
    begin: beginPagination,
    isCurrent: isPaginationCurrent,
    finish: finishPagination,
  } = useAsyncAuthorityFence(`public-profile-pagination:${profileScopeKey}`);

  const [snapshotState, setSnapshotState] = useState<{
    scopeKey: string;
    profileId: string;
    snapshot: PublicProfileResponse;
  } | null>(null);
  const currentSnapshotState =
    snapshotState?.scopeKey === profileScopeKey ? snapshotState : null;
  const snapshot = currentSnapshotState?.snapshot ?? null;

  const [viewState, setViewState] = useState<{
    scopeKey: string;
    loadingMore: boolean;
    error: string | null;
    loadMoreError: string | null;
    cursorCycle: boolean;
  } | null>(null);
  const pagingRef = useRef<{ scopeKey: string; cursor: string } | null>(null);
  const loadedActivityCursors = useRef({
    scopeKey: profileScopeKey,
    cursors: new Set<string>(),
  });
  const currentViewState =
    viewState?.scopeKey === profileScopeKey ? viewState : null;
  const loadingMore = currentViewState?.loadingMore ?? false;
  const error = currentViewState?.error ?? null;
  const loadMoreError = currentViewState?.loadMoreError ?? null;
  const cursorCycle = currentViewState?.cursorCycle ?? false;

  useEffect(() => {
    loadedActivityCursors.current = {
      scopeKey: profileScopeKey,
      cursors: new Set(),
    };
    if (!profileId) {
      setViewState({
        scopeKey: profileScopeKey,
        loadingMore: false,
        loadMoreError: null,
        error: "Perfil inválido.",
        cursorCycle: false,
      });
      return;
    }

    const ticket = beginLoad();
    if (!isLoadCurrent(ticket)) return;
    setViewState({
      scopeKey: profileScopeKey,
      loadingMore: false,
      loadMoreError: null,
      error: null,
      cursorCycle: false,
    });

    void profileApi
      .publicProfile(profileId, ticket.signal)
      .then((result) => {
        if (!isLoadCurrent(ticket)) return;
        setSnapshotState({
          scopeKey: profileScopeKey,
          profileId,
          snapshot: result,
        });
      })
      .catch((nextError: unknown) => {
        if (!isLoadCurrent(ticket)) return;
        setViewState({
          scopeKey: profileScopeKey,
          loadingMore: false,
          loadMoreError: null,
          error:
            isProfileApiError(nextError) && nextError.status === 404
              ? "Este perfil no existe o ya no está disponible."
              : "No pudimos cargar este perfil.",
          cursorCycle: false,
        });
      })
      .finally(() => {
        finishLoad(ticket);
      });
  }, [beginLoad, finishLoad, isLoadCurrent, profileId, profileScopeKey]);

  const loadMoreActivities = async () => {
    if (
      !profileId ||
      !snapshot?.profile.activitiesNextCursor ||
      currentSnapshotState?.profileId !== profileId ||
      loadingMore ||
      pagingRef.current?.scopeKey === profileScopeKey
    ) {
      return;
    }

    const target = snapshot;
    const cursor = target.profile.activitiesNextCursor;
    if (!cursor) return;
    pagingRef.current = { scopeKey: profileScopeKey, cursor };
    const ticket = beginPagination();
    if (!isPaginationCurrent(ticket)) {
      pagingRef.current = null;
      return;
    }
    setViewState((previous) => ({
      scopeKey: profileScopeKey,
      loadingMore: true,
      error: previous?.scopeKey === profileScopeKey ? previous.error : null,
      loadMoreError: null,
      cursorCycle: false,
    }));

    try {
      const page = await profileApi.publicActivities(
        profileId,
        cursor,
        target.profile.activitiesLimit ?? 20,
        ticket.signal,
      );
      if (!isPaginationCurrent(ticket)) return;
      const cursorState = loadedActivityCursors.current;
      const loadedCursors =
        cursorState.scopeKey === profileScopeKey
          ? cursorState.cursors
          : new Set<string>();
      if (activityCursorRepeats(loadedCursors, cursor, page.nextCursor)) {
        setSnapshotState((current) => {
          if (
            current?.scopeKey !== profileScopeKey ||
            current.profileId !== profileId ||
            !current.snapshot.profile.activities
          ) {
            return current;
          }

          return {
            ...current,
            snapshot: {
              ...current.snapshot,
              profile: {
                ...current.snapshot.profile,
                activities: appendActivities(
                  current.snapshot.profile.activities,
                  page.items,
                ),
                activitiesNextCursor: null,
              },
            },
          };
        });
        setViewState((previous) => ({
          scopeKey: profileScopeKey,
          loadingMore: true,
          error: previous?.scopeKey === profileScopeKey ? previous.error : null,
          loadMoreError:
            "Recibimos una página repetida. Conservamos las actividades cargadas; podés actualizar para volver a empezar.",
          cursorCycle: true,
        }));
        return;
      }
      loadedCursors.add(cursor);
      loadedActivityCursors.current = {
        scopeKey: profileScopeKey,
        cursors: loadedCursors,
      };
      setSnapshotState((current) => {
        if (
          current?.scopeKey !== profileScopeKey ||
          current.profileId !== profileId ||
          !current.snapshot.profile.activities
        ) {
          return current;
        }

        return {
          ...current,
          snapshot: {
            ...current.snapshot,
            profile: {
              ...current.snapshot.profile,
              activities: appendActivities(
                current.snapshot.profile.activities,
                page.items,
              ),
              activitiesNextCursor: page.nextCursor,
            },
          },
        };
      });
    } catch {
      if (!isPaginationCurrent(ticket)) return;
      setViewState((previous) =>
        previous?.scopeKey === profileScopeKey
          ? {
              ...previous,
              loadMoreError:
                "No pudimos cargar más actividades. Reintentá cuando vuelva la conexión.",
            }
          : previous,
      );
    } finally {
      if (pagingRef.current?.scopeKey === profileScopeKey) {
        pagingRef.current = null;
      }
      if (finishPagination(ticket)) {
        setViewState((current) =>
          current?.scopeKey === profileScopeKey
            ? { ...current, loadingMore: false }
            : current,
        );
      }
    }
  };

  const refreshActivities = async () => {
    if (
      !profileId ||
      currentSnapshotState?.profileId !== profileId ||
      loadingMore ||
      pagingRef.current?.scopeKey === profileScopeKey
    ) {
      return;
    }

    pagingRef.current = { scopeKey: profileScopeKey, cursor: "refresh" };
    const ticket = beginPagination();
    if (!isPaginationCurrent(ticket)) {
      pagingRef.current = null;
      return;
    }
    setViewState((previous) => ({
      scopeKey: profileScopeKey,
      loadingMore: true,
      error: previous?.scopeKey === profileScopeKey ? previous.error : null,
      loadMoreError: null,
      cursorCycle,
    }));

    try {
      const result = await profileApi.publicProfile(profileId, ticket.signal);
      if (!isPaginationCurrent(ticket)) return;
      loadedActivityCursors.current = {
        scopeKey: profileScopeKey,
        cursors: new Set(),
      };
      setSnapshotState({
        scopeKey: profileScopeKey,
        profileId,
        snapshot: result,
      });
      setViewState((previous) => ({
        scopeKey: profileScopeKey,
        loadingMore: true,
        error: previous?.scopeKey === profileScopeKey ? previous.error : null,
        loadMoreError: null,
        cursorCycle: false,
      }));
    } catch (nextError) {
      if (!isPaginationCurrent(ticket)) return;
      if (isProfileApiError(nextError) && nextError.status === 404) {
        setSnapshotState(null);
        setViewState({
          scopeKey: profileScopeKey,
          loadingMore: true,
          error: "Este perfil no existe o ya no está disponible.",
          loadMoreError: null,
          cursorCycle: false,
        });
      } else {
        setViewState((previous) => ({
          scopeKey: profileScopeKey,
          loadingMore: true,
          error: previous?.scopeKey === profileScopeKey ? previous.error : null,
          loadMoreError:
            "No pudimos actualizar el perfil. Podés volver a intentarlo.",
          cursorCycle: true,
        }));
      }
    } finally {
      if (pagingRef.current?.scopeKey === profileScopeKey) {
        pagingRef.current = null;
      }
      if (finishPagination(ticket)) {
        setViewState((current) =>
          current?.scopeKey === profileScopeKey
            ? { ...current, loadingMore: false }
            : current,
        );
      }
    }
  };

  if (error) {
    return (
      <section className="profile-page">
        {feedReturnLink}
        <p className="profile-error" role="alert">
          {error}
        </p>
        {!feedReturnLink ? <Link to="/">Volver al inicio</Link> : null}
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="profile-page">
        {feedReturnLink}
        <p role="status">Cargando perfil…</p>
      </section>
    );
  }

  const { profile } = snapshot;

  return (
    <section className="profile-page public-profile">
      {feedReturnLink}
      <header className="profile-hero">
        <div>
          <p className="profile-eyebrow">Perfil en Los Apuntes</p>
          <h1>{profile.about?.displayName ?? "Perfil privado"}</h1>
          {profile.professional?.headline && (
            <p className="public-profile-headline">
              {profile.professional.headline}
            </p>
          )}
          {profile.about?.bio && <p>{profile.about.bio}</p>}
        </div>
        {profile.about?.displayName && status === "authenticated" && (
          <PublicProfileSocialActions
            profileId={profile.id}
            viewerScopeKey={viewerScopeKey}
          />
        )}
        {profile.about?.displayName && status === "anonymous" && (
          <Link className="public-profile-signin" to="/login">
            Ingresá para seguir o conectar
          </Link>
        )}
      </header>

      <div className="profile-grid">
        {profile.skills && (
          <section className="profile-card">
            <h2>Habilidades e intereses</h2>
            {profile.skills.skills.length > 0 && (
              <p>
                <strong>Habilidades:</strong> {profile.skills.skills.join(", ")}
              </p>
            )}
            {profile.skills.interests.length > 0 && (
              <p>
                <strong>Intereses:</strong>{" "}
                {profile.skills.interests.join(", ")}
              </p>
            )}
            {profile.skills.languages.length > 0 && (
              <p>
                <strong>Idiomas:</strong> {profile.skills.languages.join(", ")}
              </p>
            )}
          </section>
        )}

        {profile.learning && (
          <section className="profile-card">
            <h2>Aprendizaje</h2>
            <p>
              <strong>Puede ayudar en:</strong>{" "}
              {profile.learning.helpTopics.join(", ") || "Sin temas publicados"}
            </p>
            <p>
              <strong>Quiere aprender:</strong>{" "}
              {profile.learning.learningTopics.join(", ") ||
                "Sin temas publicados"}
            </p>
          </section>
        )}

        {profile.professional && (
          <section className="profile-card">
            <h2>Proyección profesional</h2>
            <p>{profile.professional.headline ?? "Sin titular publicado"}</p>
          </section>
        )}

        {profile.academic && (
          <section className="profile-card">
            <h2>Trayectoria académica</h2>
            <p>
              {profile.academic.affiliations.length} afiliación(es) académica(s)
              publicada(s).
            </p>
            <p>
              {profile.academic.participations.length} materia(s) asociada(s).
            </p>
          </section>
        )}

        {profile.activities && (
          <section className="profile-card profile-wide">
            <h2>Proyectos y actividades</h2>
            {profile.activities.length === 0 ? (
              <p>No hay actividades publicadas.</p>
            ) : (
              <ul className="public-activity-list">
                {profile.activities.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    {item.description && <p>{item.description}</p>}
                  </li>
                ))}
              </ul>
            )}
            {loadMoreError && (
              <p className="profile-error" role="alert">
                {loadMoreError}
              </p>
            )}
            {(profile.activitiesNextCursor || cursorCycle) && (
              <button
                type="button"
                className="secondary"
                disabled={loadingMore}
                onClick={() =>
                  void (cursorCycle
                    ? refreshActivities()
                    : loadMoreActivities())
                }
              >
                {loadingMore
                  ? cursorCycle
                    ? "Actualizando…"
                    : "Cargando…"
                  : cursorCycle
                    ? "Actualizar actividades"
                    : loadMoreError
                      ? "Reintentar actividades"
                      : "Cargar más actividades"}
              </button>
            )}
          </section>
        )}
      </div>
    </section>
  );
};

export default PublicProfile;
