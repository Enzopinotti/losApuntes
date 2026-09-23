import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type {
  OwnerProfileResponse,
  ProfileActivityType,
  ProfileSection,
  ProfileVisibility,
} from "../features/profile/interfaces";
import {
  isProfileApiError,
  profileApi,
} from "../features/profile/services/profileService";
import "./Profile.scss";

type ReadyProfile = Extract<
  OwnerProfileResponse,
  { onboardingRequired: false }
>;

const sections: Array<{ key: ProfileSection; label: string }> = [
  { key: "about", label: "Presentación" },
  { key: "academic", label: "Trayectoria académica" },
  { key: "learning", label: "Aprendizaje y ayuda" },
  { key: "activities", label: "Proyectos y actividades" },
  { key: "skills", label: "Habilidades e intereses" },
  { key: "professional", label: "Proyección profesional" },
  { key: "contributions", label: "Contribuciones" },
];

const visibilityOptions: Array<{
  value: ProfileVisibility;
  label: string;
}> = [
  { value: "public", label: "Público" },
  { value: "university", label: "Comunidad universitaria" },
  { value: "connections", label: "Conexiones" },
  { value: "private", label: "Privado" },
];

function toList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function messageFor(error: unknown): string {
  if (!isProfileApiError(error)) {
    return "No pudimos completar la operación.";
  }

  if (error.code === "PROFILE_REVISION_CONFLICT") {
    return "Tu perfil cambió en otra pestaña. Recargalo antes de guardar.";
  }

  if (error.code === "PROFILE_ACTIVITY_PERIOD_INVALID") {
    return "La fecha de fin no puede ser anterior a la fecha de inicio.";
  }

  return error.message;
}

const Profile = () => {
  const [snapshot, setSnapshot] = useState<ReadyProfile | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [languages, setLanguages] = useState("");
  const [skills, setSkills] = useState("");
  const [interests, setInterests] = useState("");
  const [helpTopics, setHelpTopics] = useState("");
  const [learningTopics, setLearningTopics] = useState("");
  const [headline, setHeadline] = useState("");
  const [careerDiscovery, setCareerDiscovery] = useState(false);
  const [visibility, setVisibility] = useState<
    Record<ProfileSection, ProfileVisibility>
  >({
    about: "public",
    academic: "private",
    learning: "private",
    activities: "private",
    skills: "private",
    professional: "private",
    contributions: "private",
  });
  const [recommendAcademic, setRecommendAcademic] = useState(true);
  const [recommendLearning, setRecommendLearning] = useState(true);
  const [recommendSkills, setRecommendSkills] = useState(true);
  const [activityType, setActivityType] =
    useState<ProfileActivityType>("project");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityStartedOn, setActivityStartedOn] = useState("");
  const [activityEndedOn, setActivityEndedOn] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback((next: ReadyProfile) => {
    setSnapshot(next);
    setOnboarding(false);
    setDisplayName(next.profile.displayName);
    setBio(next.profile.bio ?? "");
    setLanguages(next.profile.languages.join(", "));
    setSkills(next.profile.skills.join(", "));
    setInterests(next.profile.interests.join(", "));
    setHelpTopics(next.profile.helpTopics.join(", "));
    setLearningTopics(next.profile.learningTopics.join(", "));
    setHeadline(next.profile.professional.headline ?? "");
    setCareerDiscovery(next.profile.professional.careerDiscoveryOptIn);
    setVisibility(next.profile.visibility);
    setRecommendAcademic(next.profile.recommendationSignals.academicContext);
    setRecommendLearning(next.profile.recommendationSignals.learning);
    setRecommendSkills(next.profile.recommendationSignals.skillsInterests);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await profileApi.me();
      if (result.onboardingRequired) {
        setSnapshot(null);
        setOnboarding(true);
      } else {
        hydrate(result);
      }
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  const createProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await profileApi.create(displayName);
      await load();
      setFeedback("Tu perfil ya está listo. Podés completarlo de a poco.");
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!snapshot) return;

    setBusy(true);
    setError(null);
    setFeedback(null);

    try {
      await profileApi.update({
        expectedRevision: snapshot.profile.revision,
        displayName,
        bio: bio.trim() || null,
        languages: toList(languages),
        skills: toList(skills),
        interests: toList(interests),
        helpTopics: toList(helpTopics),
        learningTopics: toList(learningTopics),
        professional: {
          headline: headline.trim() || null,
          careerDiscoveryOptIn: careerDiscovery,
        },
        visibility,
        recommendationSignals: {
          academicContext: recommendAcademic,
          learning: recommendLearning,
          skillsInterests: recommendSkills,
        },
      });
      await load();
      setFeedback("Perfil actualizado.");
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(false);
    }
  };

  const addActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await profileApi.createActivity({
        type: activityType,
        title: activityTitle,
        description: activityDescription.trim() || null,
        startedOn: activityStartedOn || null,
        endedOn: activityEndedOn || null,
      });
      setActivityTitle("");
      setActivityDescription("");
      setActivityStartedOn("");
      setActivityEndedOn("");
      await load();
      setFeedback("Actividad agregada.");
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(false);
    }
  };

  const removeActivity = async (id: string) => {
    if (!snapshot) return;
    const target = snapshot.activities.find((item) => item.id === id);
    if (!target) return;

    setBusy(true);
    setError(null);

    try {
      await profileApi.deleteActivity(target);
      await load();
      setFeedback("Actividad eliminada.");
    } catch (nextError) {
      setError(messageFor(nextError));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="profile-page">
        <p role="status">Cargando tu perfil…</p>
      </section>
    );
  }

  if (onboarding) {
    return (
      <section className="profile-page profile-onboarding">
        <p className="profile-eyebrow">Tu identidad universitaria</p>
        <h1>Creá tu perfil</h1>
        <p>
          Empezamos con lo mínimo. Tu universidad, carrera y materias siguen
          siendo datos académicos separados y validados por el servidor.
        </p>
        {error && (
          <p className="profile-error" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={createProfile} className="profile-card">
          <label htmlFor="profile-display-name">Nombre para mostrar</label>
          <input
            id="profile-display-name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <button disabled={busy} type="submit">
            {busy ? "Creando…" : "Crear perfil"}
          </button>
        </form>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="profile-page">
        <p className="profile-error" role="alert">
          No pudimos cargar tu perfil.
        </p>
        <button type="button" onClick={() => void load()}>
          Reintentar
        </button>
      </section>
    );
  }

  return (
    <section className="profile-page" aria-labelledby="profile-title">
      <header className="profile-hero">
        <div>
          <p className="profile-eyebrow">Mi perfil</p>
          <h1 id="profile-title">{snapshot.profile.displayName}</h1>
          <p>
            Tu perfil expresa quién sos; el contexto académico sigue viniendo
            del Academic Graph.
          </p>
        </div>
        <Link className="profile-public-link" to={`/p/${snapshot.profile.id}`}>
          Ver perfil público
        </Link>
      </header>

      {feedback && (
        <p className="profile-success" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="profile-error" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={saveProfile} className="profile-grid">
        <section className="profile-card">
          <h2>Presentación</h2>
          <label htmlFor="profile-name">Nombre para mostrar</label>
          <input
            id="profile-name"
            required
            minLength={2}
            maxLength={80}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <label htmlFor="profile-bio">Bio</label>
          <textarea
            id="profile-bio"
            maxLength={500}
            rows={5}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
          />
          <label htmlFor="profile-headline">Titular profesional opcional</label>
          <input
            id="profile-headline"
            maxLength={140}
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
          />
          <label className="profile-check">
            <input
              type="checkbox"
              checked={careerDiscovery}
              onChange={(event) => setCareerDiscovery(event.target.checked)}
            />
            Permitir futura visibilidad en descubrimiento profesional
          </label>
          <small>
            Este opt-in no publica datos por sí solo y nunca se infiere de tu
            actividad académica.
          </small>
        </section>

        <section className="profile-card">
          <h2>Habilidades y aprendizaje</h2>
          <p className="profile-help">Separá los valores con comas.</p>
          <label htmlFor="profile-languages">Idiomas</label>
          <input
            id="profile-languages"
            value={languages}
            onChange={(event) => setLanguages(event.target.value)}
          />
          <label htmlFor="profile-skills">Habilidades</label>
          <input
            id="profile-skills"
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
          />
          <label htmlFor="profile-interests">Intereses</label>
          <input
            id="profile-interests"
            value={interests}
            onChange={(event) => setInterests(event.target.value)}
          />
          <label htmlFor="profile-help-topics">
            Temas en los que puedo ayudar
          </label>
          <input
            id="profile-help-topics"
            value={helpTopics}
            onChange={(event) => setHelpTopics(event.target.value)}
          />
          <label htmlFor="profile-learning-topics">
            Temas que quiero aprender
          </label>
          <input
            id="profile-learning-topics"
            value={learningTopics}
            onChange={(event) => setLearningTopics(event.target.value)}
          />
        </section>

        <section className="profile-card profile-wide">
          <h2>Privacidad por sección</h2>
          <p className="profile-help">
            “Universidad” y “Conexiones” se guardan hoy de forma fail-closed: no
            se muestran públicamente hasta que exista autoridad verificable.
          </p>
          <div className="profile-privacy-grid">
            {sections.map((section) => (
              <label key={section.key}>
                {section.label}
                <select
                  value={visibility[section.key]}
                  onChange={(event) =>
                    setVisibility((current) => ({
                      ...current,
                      [section.key]: event.target.value as ProfileVisibility,
                    }))
                  }
                >
                  {visibilityOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className="profile-card">
          <h2>Señales de recomendación</h2>
          <p className="profile-help">
            Esto controla futuras señales de personalización; no cambia qué ve
            otra persona en tu perfil.
          </p>
          <label className="profile-check">
            <input
              type="checkbox"
              checked={recommendAcademic}
              onChange={(event) => setRecommendAcademic(event.target.checked)}
            />
            Usar contexto académico
          </label>
          <label className="profile-check">
            <input
              type="checkbox"
              checked={recommendLearning}
              onChange={(event) => setRecommendLearning(event.target.checked)}
            />
            Usar intereses de aprendizaje
          </label>
          <label className="profile-check">
            <input
              type="checkbox"
              checked={recommendSkills}
              onChange={(event) => setRecommendSkills(event.target.checked)}
            />
            Usar habilidades e intereses
          </label>
        </section>

        <section className="profile-card">
          <h2>Contexto académico</h2>
          <p>
            Afiliaciones:{" "}
            <strong>{snapshot.academic.affiliations.length}</strong>
          </p>
          <p>
            Materias asociadas:{" "}
            <strong>{snapshot.academic.participations.length}</strong>
          </p>
          <p>
            Contexto actual:{" "}
            <strong>
              {snapshot.academic.currentContext ? "Configurado" : "Pendiente"}
            </strong>
          </p>
          <small>
            Estos datos no se editan acá para evitar dos fuentes de verdad.
          </small>
        </section>

        <div className="profile-actions profile-wide">
          <button disabled={busy} type="submit">
            {busy ? "Guardando…" : "Guardar perfil"}
          </button>
        </div>
      </form>

      <section className="profile-card profile-activities">
        <h2>Proyectos y actividades</h2>
        {snapshot.activities.length === 0 ? (
          <p>Todavía no agregaste actividades.</p>
        ) : (
          <ul>
            {snapshot.activities.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.type.replace("_", " ")}</span>
                  {item.description && <p>{item.description}</p>}
                  {(item.startedOn || item.endedOn) && (
                    <small>
                      {item.startedOn ?? "—"} → {item.endedOn ?? "actualidad"}
                    </small>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeActivity(item.id)}
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addActivity} className="profile-activity-form">
          <label>
            Tipo
            <select
              value={activityType}
              onChange={(event) =>
                setActivityType(event.target.value as ProfileActivityType)
              }
            >
              <option value="project">Proyecto</option>
              <option value="research">Investigación</option>
              <option value="club">Club / organización</option>
              <option value="volunteering">Voluntariado</option>
              <option value="academic_work">Trabajo académico</option>
            </select>
          </label>
          <label>
            Título
            <input
              required
              minLength={2}
              maxLength={120}
              value={activityTitle}
              onChange={(event) => setActivityTitle(event.target.value)}
            />
          </label>
          <label className="profile-wide">
            Descripción
            <textarea
              rows={3}
              maxLength={1000}
              value={activityDescription}
              onChange={(event) => setActivityDescription(event.target.value)}
            />
          </label>
          <label>
            Desde
            <input
              type="month"
              value={activityStartedOn}
              onChange={(event) => setActivityStartedOn(event.target.value)}
            />
          </label>
          <label>
            Hasta
            <input
              type="month"
              value={activityEndedOn}
              onChange={(event) => setActivityEndedOn(event.target.value)}
            />
          </label>
          <button disabled={busy} type="submit">
            Agregar actividad
          </button>
        </form>
      </section>
    </section>
  );
};

export default Profile;
