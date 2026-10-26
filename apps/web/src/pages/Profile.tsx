import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import type {
  OwnerProfileResponse,
  ProfileAccentPreset,
  ProfileActivity,
  ProfileActivityType,
  ProfileCoverPreset,
  ProfileSection,
  ProfileVisibility,
} from "../features/profile/interfaces";
import { activityCursorRepeats } from "../features/profile/activityPagination";
import {
  isProfileApiError,
  profileApi,
} from "../features/profile/services/profileService";
import { useAsyncAuthorityFence } from "../shared/useAsyncAuthorityFence";
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

const accentPresetOptions: Array<{
  value: ProfileAccentPreset;
  label: string;
}> = [
  { value: "default", label: "Predeterminado" },
  { value: "indigo", label: "Índigo" },
  { value: "emerald", label: "Esmeralda" },
  { value: "amber", label: "Ámbar" },
  { value: "rose", label: "Rosa" },
  { value: "slate", label: "Pizarra" },
];

const coverPresetOptions: Array<{
  value: ProfileCoverPreset;
  label: string;
}> = [
  { value: "none", label: "Sin portada" },
  { value: "gradient", label: "Degradado" },
  { value: "paper", label: "Papel" },
  { value: "campus", label: "Campus" },
];

function toList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function appendActivities(
  current: ProfileActivity[],
  next: ProfileActivity[],
): ProfileActivity[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
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
  } = useAsyncAuthorityFence(`profile-owner-load:${authScopeKey}`);
  const {
    begin: beginAction,
    isCurrent: isActionCurrent,
    finish: finishAction,
  } = useAsyncAuthorityFence(`profile-owner-action:${authScopeKey}`);

  const [snapshotState, setSnapshotState] = useState<{
    scopeKey: string;
    snapshot: ReadyProfile | null;
    onboarding: boolean;
  } | null>(null);
  const currentSnapshotState =
    snapshotState?.scopeKey === authScopeKey ? snapshotState : null;
  const snapshot = currentSnapshotState?.snapshot ?? null;
  const onboarding = currentSnapshotState?.onboarding ?? false;

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [languages, setLanguages] = useState("");
  const [skills, setSkills] = useState("");
  const [interests, setInterests] = useState("");
  const [helpTopics, setHelpTopics] = useState("");
  const [learningTopics, setLearningTopics] = useState("");
  const [headline, setHeadline] = useState("");
  const [accentPreset, setAccentPreset] =
    useState<ProfileAccentPreset>("default");
  const [coverPreset, setCoverPreset] = useState<ProfileCoverPreset>("none");
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

  const [loadState, setLoadState] = useState<{
    scopeKey: string;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const currentLoadState =
    loadState?.scopeKey === authScopeKey ? loadState : null;
  const loading = currentLoadState?.loading ?? true;

  const [actionState, setActionState] = useState<{
    scopeKey: string;
    busy: boolean;
    error: string | null;
    feedback: string | null;
  } | null>(null);
  const currentActionState =
    actionState?.scopeKey === authScopeKey ? actionState : null;
  const busy = currentActionState?.busy ?? false;
  const feedback = currentActionState?.feedback ?? null;
  const error = currentActionState?.error ?? currentLoadState?.error ?? null;
  const [activityCursorIssue, setActivityCursorIssue] = useState<{
    scopeKey: string;
  } | null>(null);
  const currentActivityCursorIssue =
    activityCursorIssue?.scopeKey === authScopeKey ? activityCursorIssue : null;
  const loadedActivityCursors = useRef(new Set<string>());

  const resetDrafts = useCallback(() => {
    setDisplayName("");
    setBio("");
    setLanguages("");
    setSkills("");
    setInterests("");
    setHelpTopics("");
    setLearningTopics("");
    setHeadline("");
    setAccentPreset("default");
    setCoverPreset("none");
    setCareerDiscovery(false);
    setVisibility({
      about: "public",
      academic: "private",
      learning: "private",
      activities: "private",
      skills: "private",
      professional: "private",
      contributions: "private",
    });
    setRecommendAcademic(true);
    setRecommendLearning(true);
    setRecommendSkills(true);
    setActivityType("project");
    setActivityTitle("");
    setActivityDescription("");
    setActivityStartedOn("");
    setActivityEndedOn("");
  }, []);

  const hydrate = useCallback((next: ReadyProfile, scopeKey: string) => {
    loadedActivityCursors.current.clear();
    setActivityCursorIssue(null);
    setSnapshotState({
      scopeKey,
      snapshot: next,
      onboarding: false,
    });
    setDisplayName(next.profile.displayName);
    setBio(next.profile.bio ?? "");
    setLanguages(next.profile.languages.join(", "));
    setSkills(next.profile.skills.join(", "));
    setInterests(next.profile.interests.join(", "));
    setHelpTopics(next.profile.helpTopics.join(", "));
    setLearningTopics(next.profile.learningTopics.join(", "));
    setHeadline(next.profile.professional.headline ?? "");
    setAccentPreset(next.profile.presentation.accentPreset);
    setCoverPreset(next.profile.presentation.coverPreset);
    setCareerDiscovery(next.profile.professional.careerDiscoveryOptIn);
    setVisibility(next.profile.visibility);
    setRecommendAcademic(next.profile.recommendationSignals.academicContext);
    setRecommendLearning(next.profile.recommendationSignals.learning);
    setRecommendSkills(next.profile.recommendationSignals.skillsInterests);
  }, []);

  const load = useCallback(async () => {
    const ticket = beginLoad();
    if (!isLoadCurrent(ticket)) return;
    setLoadState({ scopeKey: authScopeKey, loading: true, error: null });

    try {
      const result = await profileApi.me(ticket.signal);
      if (!isLoadCurrent(ticket)) return;
      if (result.onboardingRequired) {
        setSnapshotState({
          scopeKey: authScopeKey,
          snapshot: null,
          onboarding: true,
        });
      } else {
        hydrate(result, authScopeKey);
      }
    } catch (nextError) {
      if (!isLoadCurrent(ticket)) return;
      setLoadState({
        scopeKey: authScopeKey,
        loading: false,
        error: messageFor(nextError),
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
  }, [authScopeKey, beginLoad, finishLoad, hydrate, isLoadCurrent]);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    resetDrafts();
    setActionState(null);
  }, [authScopeKey, resetDrafts]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginBusyAction = () => {
    const ticket = beginAction();
    if (!isActionCurrent(ticket)) return null;
    setActionState({
      scopeKey: authScopeKey,
      busy: true,
      error: null,
      feedback: null,
    });
    return ticket;
  };

  const finishBusyAction = (ticket: ReturnType<typeof beginAction>) => {
    if (finishAction(ticket)) {
      setActionState((current) =>
        current?.scopeKey === authScopeKey
          ? { ...current, busy: false }
          : current,
      );
    }
  };

  const createProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ticket = beginBusyAction();
    if (!ticket) return;

    try {
      await profileApi.create(displayName, ticket.signal);
      if (!isActionCurrent(ticket)) return;
      await loadRef.current();
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: true,
        error: null,
        feedback: "Tu perfil ya está listo. Podés completarlo de a poco.",
      });
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: true,
        error: messageFor(nextError),
        feedback: null,
      });
    } finally {
      finishBusyAction(ticket);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!snapshot) return;
    const target = snapshot;
    const ticket = beginBusyAction();
    if (!ticket) return;

    try {
      await profileApi.update(
        {
          expectedRevision: target.profile.revision,
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
          presentation: { accentPreset, coverPreset },
          visibility,
          recommendationSignals: {
            academicContext: recommendAcademic,
            learning: recommendLearning,
            skillsInterests: recommendSkills,
          },
        },
        ticket.signal,
      );
      if (!isActionCurrent(ticket)) return;
      await loadRef.current();
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: true,
        error: null,
        feedback: "Perfil actualizado.",
      });
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: true,
        error: messageFor(nextError),
        feedback: null,
      });
    } finally {
      finishBusyAction(ticket);
    }
  };

  const loadMoreActivities = async () => {
    if (!snapshot?.activitiesNextCursor) return;
    const target = snapshot;
    const requestedCursor = target.activitiesNextCursor;
    if (!requestedCursor) return;
    const ticket = beginBusyAction();
    if (!ticket) return;

    try {
      const page = await profileApi.activities(
        requestedCursor,
        target.activitiesLimit,
        ticket.signal,
      );
      if (!isActionCurrent(ticket)) return;
      if (
        activityCursorRepeats(
          loadedActivityCursors.current,
          requestedCursor,
          page.nextCursor,
        )
      ) {
        setSnapshotState((current) =>
          current?.scopeKey === authScopeKey && current.snapshot
            ? {
                ...current,
                snapshot: {
                  ...current.snapshot,
                  activities: appendActivities(
                    current.snapshot.activities,
                    page.items,
                  ),
                  activitiesNextCursor: null,
                },
              }
            : current,
        );
        setActivityCursorIssue({ scopeKey: authScopeKey });
        return;
      }
      loadedActivityCursors.current.add(requestedCursor);
      setSnapshotState((current) =>
        current?.scopeKey === authScopeKey && current.snapshot
          ? {
              ...current,
              snapshot: {
                ...current.snapshot,
                activities: appendActivities(
                  current.snapshot.activities,
                  page.items,
                ),
                activitiesNextCursor: page.nextCursor,
              },
            }
          : current,
      );
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: true,
        error: messageFor(nextError),
        feedback: null,
      });
    } finally {
      finishBusyAction(ticket);
    }
  };

  const refreshActivities = async () => {
    if (!snapshot) return;
    const target = snapshot;
    const ticket = beginBusyAction();
    if (!ticket) return;

    try {
      const page = await profileApi.activities(
        undefined,
        target.activitiesLimit,
        ticket.signal,
      );
      if (!isActionCurrent(ticket)) return;
      loadedActivityCursors.current.clear();
      setActivityCursorIssue(null);
      setSnapshotState((current) =>
        current?.scopeKey === authScopeKey && current.snapshot
          ? {
              ...current,
              snapshot: {
                ...current.snapshot,
                activities: appendActivities([], page.items),
                activitiesNextCursor: page.nextCursor,
              },
            }
          : current,
      );
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: true,
        error: messageFor(nextError),
        feedback: null,
      });
    } finally {
      finishBusyAction(ticket);
    }
  };

  const addActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ticket = beginBusyAction();
    if (!ticket) return;

    try {
      await profileApi.createActivity(
        {
          type: activityType,
          title: activityTitle,
          description: activityDescription.trim() || null,
          startedOn: activityStartedOn || null,
          endedOn: activityEndedOn || null,
        },
        ticket.signal,
      );
      if (!isActionCurrent(ticket)) return;
      setActivityTitle("");
      setActivityDescription("");
      setActivityStartedOn("");
      setActivityEndedOn("");
      await loadRef.current();
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: true,
        error: null,
        feedback: "Actividad agregada.",
      });
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: true,
        error: messageFor(nextError),
        feedback: null,
      });
    } finally {
      finishBusyAction(ticket);
    }
  };

  const removeActivity = async (id: string) => {
    if (!snapshot) return;
    const target = snapshot.activities.find((item) => item.id === id);
    if (!target) return;
    const ticket = beginBusyAction();
    if (!ticket) return;

    try {
      await profileApi.deleteActivity(target, ticket.signal);
      if (!isActionCurrent(ticket)) return;
      await loadRef.current();
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: true,
        error: null,
        feedback: "Actividad eliminada.",
      });
    } catch (nextError) {
      if (!isActionCurrent(ticket)) return;
      setActionState({
        scopeKey: authScopeKey,
        busy: true,
        error: messageFor(nextError),
        feedback: null,
      });
    } finally {
      finishBusyAction(ticket);
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
          <h3>Apariencia del perfil</h3>
          <p className="profile-help">
            Estos estilos se ven en tu perfil público y no cambian su
            privacidad.
          </p>
          <label htmlFor="profile-accent-preset">Color de acento</label>
          <select
            id="profile-accent-preset"
            value={accentPreset}
            onChange={(event) =>
              setAccentPreset(event.target.value as ProfileAccentPreset)
            }
          >
            {accentPresetOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label htmlFor="profile-cover-preset">Portada</label>
          <select
            id="profile-cover-preset"
            value={coverPreset}
            onChange={(event) =>
              setCoverPreset(event.target.value as ProfileCoverPreset)
            }
          >
            {coverPresetOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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

        {snapshot.activitiesNextCursor && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void loadMoreActivities()}
          >
            Cargar más actividades
          </button>
        )}

        {currentActivityCursorIssue && (
          <>
            <p className="profile-error" role="alert">
              Recibimos una página repetida y detuvimos la lista. Conservamos
              las actividades ya cargadas; podés actualizar para volver a
              empezar.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void refreshActivities()}
            >
              {busy ? "Actualizando…" : "Actualizar actividades"}
            </button>
          </>
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
