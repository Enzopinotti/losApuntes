import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  ProfileActivity,
  PublicProfileResponse,
} from "../features/profile/interfaces";
import {
  isProfileApiError,
  profileApi,
} from "../features/profile/services/profileService";
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
  const { status, user, session } = useAuth();
  const viewerScopeKey = [
    status,
    user?.id ?? "anonymous",
    session?.id ?? "no-session",
  ].join(":");
  const profileScopeKey = [
    profileId ?? "missing-profile",
    viewerScopeKey,
  ].join(":");
  const {
    begin: beginLoad,
    isCurrent: isLoadCurrent,
    finish: finishLoad,
  } = useAsyncAuthorityFence(`public-profile-load:${profileScopeKey}`);
  const {
    begin: beginPagination,
    isCurrent: isPaginationCurrent,
    finish: finishPagination,
  } = useAsyncAuthorityFence(
    `public-profile-pagination:${profileScopeKey}`,
  );

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
  } | null>(null);
  const currentViewState =
    viewState?.scopeKey === profileScopeKey ? viewState : null;
  const loadingMore = currentViewState?.loadingMore ?? false;
  const error = currentViewState?.error ?? null;

  useEffect(() => {
    if (!profileId) {
      setViewState({
        scopeKey: profileScopeKey,
        loadingMore: false,
        error: "Perfil inválido.",
      });
      return;
    }

    const ticket = beginLoad();
    if (!isLoadCurrent(ticket)) return;
    setViewState({
      scopeKey: profileScopeKey,
      loadingMore: false,
      error: null,
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
          error:
            isProfileApiError(nextError) && nextError.status === 404
              ? "Este perfil no existe o ya no está disponible."
              : "No pudimos cargar este perfil.",
        });
      })
      .finally(() => {
        finishLoad(ticket);
      });
  }, [
    beginLoad,
    finishLoad,
    isLoadCurrent,
    profileId,
    profileScopeKey,
  ]);

  const loadMoreActivities = async () => {
    if (
      !profileId ||
      !snapshot?.profile.activitiesNextCursor ||
      currentSnapshotState?.profileId !== profileId
    ) {
      return;
    }

    const target = snapshot;
    const cursor = target.profile.activitiesNextCursor;
    const ticket = beginPagination();
    if (!isPaginationCurrent(ticket)) return;
    setViewState({
      scopeKey: profileScopeKey,
      loadingMore: true,
      error: null,
    });

    try {
      const page = await profileApi.publicActivities(
        profileId,
        cursor,
        target.profile.activitiesLimit ?? 20,
        ticket.signal,
      );
      if (!isPaginationCurrent(ticket)) return;
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
      setViewState({
        scopeKey: profileScopeKey,
        loadingMore: true,
        error: "No pudimos cargar más actividades de este perfil.",
      });
    } finally {
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
        <p className="profile-error" role="alert">
          {error}
        </p>
        <Link to="/">Volver al inicio</Link>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="profile-page">
        <p role="status">Cargando perfil…</p>
      </section>
    );
  }

  const { profile } = snapshot;

  return (
    <section className="profile-page public-profile">
      <header className="profile-hero">
        <div>
          <p className="profile-eyebrow">Perfil en Los Apuntes</p>
          <h1>{profile.about?.displayName ?? "Perfil privado"}</h1>
          {profile.about?.bio && <p>{profile.about.bio}</p>}
        </div>
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
            {profile.activitiesNextCursor && (
              <button
                type="button"
                className="secondary"
                disabled={loadingMore}
                onClick={() => void loadMoreActivities()}
              >
                {loadingMore ? "Cargando…" : "Cargar más actividades"}
              </button>
            )}
          </section>
        )}
      </div>
    </section>
  );
};

export default PublicProfile;
