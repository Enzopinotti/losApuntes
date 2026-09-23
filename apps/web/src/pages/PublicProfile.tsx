import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PublicProfileResponse } from "../features/profile/interfaces";
import {
  isProfileApiError,
  profileApi,
} from "../features/profile/services/profileService";
import "./Profile.scss";

const PublicProfile = () => {
  const { profileId } = useParams();
  const [snapshot, setSnapshot] = useState<PublicProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) {
      setError("Perfil inválido.");
      return;
    }

    let active = true;

    void profileApi
      .publicProfile(profileId)
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        if (isProfileApiError(nextError) && nextError.status === 404) {
          setError("Este perfil no existe o ya no está disponible.");
          return;
        }
        setError("No pudimos cargar este perfil.");
      });

    return () => {
      active = false;
    };
  }, [profileId]);

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
          </section>
        )}
      </div>
    </section>
  );
};

export default PublicProfile;
