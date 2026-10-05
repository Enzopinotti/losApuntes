import type {
  OwnerProfile,
  ProfileActivityType,
  ProfileSection,
  ProfileVisibility,
  UpdateProfileInput,
} from "@losapuntes/contracts";
import { Link, Redirect, useIsFocused, useRouter } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import {
  ProductSurface,
  productSurfaceStyles,
} from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";

import {
  MobileProfileController,
  type MobileProfileFailure,
  type MobileProfileSnapshot,
} from "./profile-controller";
import { mobileProfileApi } from "./profile-runtime";

const profileSections: Array<{ key: ProfileSection; label: string }> = [
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
  { value: "university", label: "Universidad" },
  { value: "connections", label: "Conexiones" },
  { value: "private", label: "Privado" },
];

const activityTypes: Array<{ value: ProfileActivityType; label: string }> = [
  { value: "project", label: "Proyecto" },
  { value: "research", label: "Investigación" },
  { value: "club", label: "Club / organización" },
  { value: "volunteering", label: "Voluntariado" },
  { value: "academic_work", label: "Trabajo académico" },
];

const defaultVisibility = (): Record<ProfileSection, ProfileVisibility> => ({
  about: "public",
  academic: "private",
  learning: "private",
  activities: "private",
  skills: "private",
  professional: "private",
  contributions: "private",
});

function listFromText(value: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const raw of value.split(",")) {
    const item = raw.normalize("NFC").trim();
    if (!item) continue;
    const key = item.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(item);
  }

  return values;
}

function listText(values: string[]): string {
  return values.join(", ");
}

function failureMessage(failure: MobileProfileFailure): string {
  if (failure.code === "PROFILE_REVISION_CONFLICT") {
    return "Tu perfil cambió en otro lugar. Recargamos la autoridad del servidor; revisá los datos antes de volver a guardar.";
  }
  if (failure.code === "PROFILE_ACTIVITY_PERIOD_INVALID") {
    return "La fecha de fin no puede ser anterior a la fecha de inicio.";
  }
  if (failure.kind === "offline") {
    return "No hay conexión. Volvé a intentar cuando estés en línea.";
  }
  if (failure.kind === "timeout") {
    return "El servidor tardó demasiado en responder.";
  }
  if (failure.kind === "server_unavailable") {
    return "El perfil no está disponible ahora.";
  }
  if (failure.kind === "restricted") {
    return "La cuenta no puede modificar este perfil.";
  }
  if (failure.kind === "auth_required") {
    return "La sesión cambió. Iniciá sesión nuevamente.";
  }
  if (failure.kind === "validation") {
    return "Revisá los datos ingresados.";
  }
  if (failure.kind === "conflict") {
    return "El perfil cambió mientras lo editabas. Actualizalo antes de reintentar.";
  }
  return "No pudimos completar la operación.";
}

function monthValue(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  return /^\d{4}-(0[1-9]|1[0-2])$/u.test(normalized) ? normalized : null;
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choiceSection}>
      <Text style={styles.label}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.choiceList}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text
                style={[
                  styles.choiceText,
                  selected && styles.choiceTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AccountActions({ logout }: { logout: () => Promise<void> }) {
  return (
    <View style={styles.accountActions}>
      <Link href="/saved-resources" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Ver recursos guardados"
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Recursos guardados</Text>
        </Pressable>
      </Link>

      <Link href="/security" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Abrir seguridad de la cuenta"
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Seguridad de la cuenta</Text>
        </Pressable>
      </Link>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar sesión"
        onPress={() => void logout()}
        style={styles.logoutButton}
      >
        <Text style={styles.logoutButtonText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

export function MobileOwnerProfileScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { snapshot: session, logout } = useSession();
  const controller = useMemo(
    () => new MobileProfileController(mobileProfileApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<MobileProfileSnapshot>(
    controller.getSnapshot(),
  );
  const [appState, setAppState] = useState(AppState.currentState);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [languages, setLanguages] = useState("");
  const [skills, setSkills] = useState("");
  const [interests, setInterests] = useState("");
  const [helpTopics, setHelpTopics] = useState("");
  const [learningTopics, setLearningTopics] = useState("");
  const [headline, setHeadline] = useState("");
  const [careerDiscovery, setCareerDiscovery] = useState(false);
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [recommendAcademic, setRecommendAcademic] = useState(true);
  const [recommendLearning, setRecommendLearning] = useState(true);
  const [recommendSkills, setRecommendSkills] = useState(true);

  const [activityType, setActivityType] =
    useState<ProfileActivityType>("project");
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityStartedOn, setActivityStartedOn] = useState("");
  const [activityEndedOn, setActivityEndedOn] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const hydratedProfile = useRef<{ id: string; revision: number } | null>(null);

  const scopeKey =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const active = Boolean(scopeKey && isFocused && appState === "active");

  const resetDrafts = useCallback(() => {
    hydratedProfile.current = null;
    setDisplayName("");
    setBio("");
    setLanguages("");
    setSkills("");
    setInterests("");
    setHelpTopics("");
    setLearningTopics("");
    setHeadline("");
    setCareerDiscovery(false);
    setVisibility(defaultVisibility());
    setRecommendAcademic(true);
    setRecommendLearning(true);
    setRecommendSkills(true);
    setActivityType("project");
    setActivityTitle("");
    setActivityDescription("");
    setActivityStartedOn("");
    setActivityEndedOn("");
    setLocalError(null);
  }, []);

  const hydrateProfile = useCallback((profile: OwnerProfile) => {
    hydratedProfile.current = { id: profile.id, revision: profile.revision };
    setDisplayName(profile.displayName);
    setBio(profile.bio ?? "");
    setLanguages(listText(profile.languages));
    setSkills(listText(profile.skills));
    setInterests(listText(profile.interests));
    setHelpTopics(listText(profile.helpTopics));
    setLearningTopics(listText(profile.learningTopics));
    setHeadline(profile.professional.headline ?? "");
    setCareerDiscovery(profile.professional.careerDiscoveryOptIn);
    setVisibility(profile.visibility);
    setRecommendAcademic(profile.recommendationSignals.academicContext);
    setRecommendLearning(profile.recommendationSignals.learning);
    setRecommendSkills(profile.recommendationSignals.skillsInterests);
  }, []);

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    resetDrafts();
  }, [resetDrafts, scopeKey]);

  useEffect(() => {
    if (!scopeKey) {
      controller.invalidate();
      return;
    }

    if (!active) {
      controller.suspend(scopeKey);
      return;
    }

    void controller.load(scopeKey);
    return () => controller.suspend(scopeKey);
  }, [active, controller, scopeKey]);

  useEffect(
    () => () => {
      controller.invalidate();
    },
    [controller],
  );

  useEffect(() => {
    if (snapshot.kind !== "ready" || snapshot.authorityKey !== scopeKey) return;
    const current = hydratedProfile.current;
    if (
      current?.id === snapshot.data.profile.id &&
      current.revision === snapshot.data.profile.revision
    ) {
      return;
    }
    hydrateProfile(snapshot.data.profile);
  }, [hydrateProfile, scopeKey, snapshot]);

  if (session.kind !== "authenticated") {
    return <Redirect href="/sign-in" />;
  }

  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === scopeKey
      ? snapshot
      : null;

  const saveProfile = async () => {
    if (!scopeKey || current?.kind !== "ready") return;
    const normalizedName = displayName.trim();
    if (normalizedName.length < 2 || normalizedName.length > 80) {
      setLocalError("El nombre debe tener entre 2 y 80 caracteres.");
      return;
    }
    if (bio.length > 500) {
      setLocalError("La bio no puede superar los 500 caracteres.");
      return;
    }
    if (headline.length > 140) {
      setLocalError("El titular no puede superar los 140 caracteres.");
      return;
    }

    setLocalError(null);
    const input: UpdateProfileInput = {
      expectedRevision: current.data.profile.revision,
      displayName: normalizedName,
      bio: bio.trim() || null,
      languages: listFromText(languages),
      skills: listFromText(skills),
      interests: listFromText(interests),
      helpTopics: listFromText(helpTopics),
      learningTopics: listFromText(learningTopics),
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
    };
    await controller.updateProfile(scopeKey, input);
  };

  const createProfile = async () => {
    if (!scopeKey || current?.kind !== "onboarding") return;
    const normalizedName = displayName.trim();
    if (normalizedName.length < 2 || normalizedName.length > 80) {
      setLocalError("El nombre debe tener entre 2 y 80 caracteres.");
      return;
    }
    setLocalError(null);
    await controller.createProfile(scopeKey, normalizedName);
  };

  const addActivity = async () => {
    if (!scopeKey || current?.kind !== "ready") return;
    const normalizedTitle = activityTitle.trim();
    if (normalizedTitle.length < 2 || normalizedTitle.length > 120) {
      setLocalError(
        "El título de la actividad debe tener entre 2 y 120 caracteres.",
      );
      return;
    }
    const startedOn = monthValue(activityStartedOn);
    const endedOn = monthValue(activityEndedOn);
    if (activityStartedOn.trim() && !startedOn) {
      setLocalError("Usá AAAA-MM para la fecha de inicio.");
      return;
    }
    if (activityEndedOn.trim() && !endedOn) {
      setLocalError("Usá AAAA-MM para la fecha de fin.");
      return;
    }
    if (startedOn && endedOn && endedOn < startedOn) {
      setLocalError("La fecha de fin no puede ser anterior al inicio.");
      return;
    }

    setLocalError(null);
    await controller.createActivity(scopeKey, {
      type: activityType,
      title: normalizedTitle,
      description: activityDescription.trim() || null,
      startedOn,
      endedOn,
    });

    const next = controller.getSnapshot();
    if (next.kind === "ready" && next.failure === null) {
      setActivityTitle("");
      setActivityDescription("");
      setActivityStartedOn("");
      setActivityEndedOn("");
    }
  };

  const failure =
    current &&
    (current.kind === "ready" || current.kind === "onboarding") &&
    current.failure
      ? current.failure
      : current?.kind === "failure"
        ? current.failure
        : null;

  const busy =
    current?.kind === "ready" || current?.kind === "onboarding"
      ? current.busy
      : false;

  return (
    <ProductSurface
      title="Perfil"
      description="Tu identidad en Los Apuntes. El contexto académico sigue siendo autoridad del servidor y no se edita desde esta pantalla."
      onRefresh={
        scopeKey && active ? () => void controller.load(scopeKey) : undefined
      }
      refreshing={current?.kind === "loading"}
    >
      {!current || current.kind === "loading" ? (
        <View style={productSurfaceStyles.card}>
          <View style={styles.loadingRow}>
            <ActivityIndicator accessibilityLabel="Cargando perfil" />
            <Text style={productSurfaceStyles.cardCopy}>
              Cargando tu perfil…
            </Text>
          </View>
        </View>
      ) : current.kind === "failure" ? (
        <View style={productSurfaceStyles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {failureMessage(current.failure)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => scopeKey && void controller.load(scopeKey)}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : current.kind === "onboarding" ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Creá tu perfil
          </Text>
          <Text style={styles.copy}>
            Empezamos por tu nombre público. Universidad, carrera y materias se
            mantienen separadas en el Academic Graph.
          </Text>
          <Text style={styles.label}>Nombre para mostrar</Text>
          <TextInput
            accessibilityLabel="Nombre para mostrar"
            editable={!busy}
            maxLength={80}
            onChangeText={setDisplayName}
            placeholder="Tu nombre"
            style={styles.input}
            value={displayName}
          />
          {localError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {localError}
            </Text>
          ) : null}
          {current.failure ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {failureMessage(current.failure)}
            </Text>
          ) : null}
          {current.notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.success}>
              {current.notice}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void createProfile()}
            style={[styles.primaryButton, busy && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>
              {busy ? "Creando…" : "Crear perfil"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.heroRow}>
              <View style={styles.heroCopy}>
                <Text accessibilityRole="header" style={styles.heroTitle}>
                  {current.data.profile.displayName}
                </Text>
                <Text style={styles.meta}>
                  Revisión {current.data.profile.revision}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver mi perfil público"
                onPress={() =>
                  router.push({
                    pathname: "/profiles/[profileId]",
                    params: { profileId: current.data.profile.id },
                  })
                }
                style={styles.compactButton}
              >
                <Text style={styles.compactButtonText}>Ver público</Text>
              </Pressable>
            </View>
            <Text style={styles.copy}>
              Contexto académico: {current.data.academic.affiliations.length}{" "}
              afiliaciones · {current.data.academic.participations.length}{" "}
              materias ·{" "}
              {current.data.academic.currentContext
                ? "contexto configurado"
                : "sin contexto actual"}
            </Text>
          </View>

          {current.notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.success}>
              {current.notice}
            </Text>
          ) : null}
          {failure ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {failureMessage(failure)}
            </Text>
          ) : null}
          {localError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {localError}
            </Text>
          ) : null}

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Presentación
            </Text>
            <Text style={styles.label}>Nombre para mostrar</Text>
            <TextInput
              accessibilityLabel="Nombre para mostrar"
              editable={!busy}
              maxLength={80}
              onChangeText={setDisplayName}
              style={styles.input}
              value={displayName}
            />
            <Text style={styles.label}>Bio</Text>
            <TextInput
              accessibilityLabel="Bio del perfil"
              editable={!busy}
              maxLength={500}
              multiline
              onChangeText={setBio}
              style={[styles.input, styles.multiline]}
              textAlignVertical="top"
              value={bio}
            />
            <Text style={styles.label}>Titular profesional</Text>
            <TextInput
              accessibilityLabel="Titular profesional"
              editable={!busy}
              maxLength={140}
              onChangeText={setHeadline}
              style={styles.input}
              value={headline}
            />
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.label}>Descubrimiento profesional</Text>
                <Text style={styles.helper}>
                  Es un opt-in. No publica datos por sí solo.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Permitir descubrimiento profesional"
                disabled={busy}
                onValueChange={setCareerDiscovery}
                value={careerDiscovery}
              />
            </View>
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Habilidades y aprendizaje
            </Text>
            <Text style={styles.helper}>Separá los valores con comas.</Text>
            {[
              ["Idiomas", languages, setLanguages],
              ["Habilidades", skills, setSkills],
              ["Intereses", interests, setInterests],
              ["Puedo ayudar con", helpTopics, setHelpTopics],
              ["Quiero aprender", learningTopics, setLearningTopics],
            ].map(([label, value, setter]) => (
              <View key={label as string} style={styles.field}>
                <Text style={styles.label}>{label as string}</Text>
                <TextInput
                  accessibilityLabel={label as string}
                  editable={!busy}
                  maxLength={600}
                  onChangeText={setter as (value: string) => void}
                  style={styles.input}
                  value={value as string}
                />
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Privacidad por sección
            </Text>
            <Text style={styles.helper}>
              Universidad y Conexiones siguen siendo fail-closed hasta que el
              servidor pueda demostrar esa audiencia.
            </Text>
            {profileSections.map((section) => (
              <ChoiceGroup
                key={section.key}
                label={section.label}
                value={visibility[section.key]}
                options={visibilityOptions}
                disabled={busy}
                onChange={(value) =>
                  setVisibility((currentVisibility) => ({
                    ...currentVisibility,
                    [section.key]: value,
                  }))
                }
              />
            ))}
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Señales de recomendación
            </Text>
            {[
              [
                "Usar contexto académico",
                recommendAcademic,
                setRecommendAcademic,
              ],
              [
                "Usar intereses de aprendizaje",
                recommendLearning,
                setRecommendLearning,
              ],
              [
                "Usar habilidades e intereses",
                recommendSkills,
                setRecommendSkills,
              ],
            ].map(([label, value, setter]) => (
              <View key={label as string} style={styles.switchRow}>
                <Text style={styles.copy}>{label as string}</Text>
                <Switch
                  accessibilityLabel={label as string}
                  disabled={busy}
                  onValueChange={setter as (value: boolean) => void}
                  value={value as boolean}
                />
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void saveProfile()}
              style={[styles.primaryButton, busy && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>
                {busy ? "Guardando…" : "Guardar perfil"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Proyectos y actividades
            </Text>
            {current.data.activities.length === 0 ? (
              <Text style={styles.copy}>Todavía no agregaste actividades.</Text>
            ) : (
              current.data.activities.map((item) => (
                <View key={item.id} style={styles.activityRow}>
                  <View style={styles.activityCopy}>
                    <Text style={styles.activityTitle}>{item.title}</Text>
                    <Text style={styles.meta}>
                      {activityTypes.find((type) => type.value === item.type)
                        ?.label ?? item.type}
                    </Text>
                    {item.description ? (
                      <Text style={styles.copy}>{item.description}</Text>
                    ) : null}
                    {item.startedOn || item.endedOn ? (
                      <Text style={styles.meta}>
                        {item.startedOn ?? "—"} → {item.endedOn ?? "actualidad"}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar actividad ${item.title}`}
                    disabled={busy}
                    onPress={() =>
                      scopeKey &&
                      void controller.deleteActivity(scopeKey, item.id)
                    }
                    style={styles.dangerButton}
                  >
                    <Text style={styles.dangerButtonText}>Eliminar</Text>
                  </Pressable>
                </View>
              ))
            )}

            {current.data.activitiesNextCursor ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: current.loadingMore || busy }}
                disabled={current.loadingMore || busy}
                onPress={() =>
                  scopeKey && void controller.loadMoreActivities(scopeKey)
                }
                style={styles.secondaryButton}
              >
                {current.loadingMore ? (
                  <ActivityIndicator accessibilityLabel="Cargando más actividades" />
                ) : (
                  <Text style={styles.secondaryButtonText}>Cargar más</Text>
                )}
              </Pressable>
            ) : null}

            <Text style={styles.label}>Tipo</Text>
            <ChoiceGroup
              label="Tipo de actividad"
              value={activityType}
              options={activityTypes}
              disabled={busy}
              onChange={setActivityType}
            />
            <Text style={styles.label}>Título</Text>
            <TextInput
              accessibilityLabel="Título de la actividad"
              editable={!busy}
              maxLength={120}
              onChangeText={setActivityTitle}
              style={styles.input}
              value={activityTitle}
            />
            <Text style={styles.label}>Descripción</Text>
            <TextInput
              accessibilityLabel="Descripción de la actividad"
              editable={!busy}
              maxLength={1000}
              multiline
              onChangeText={setActivityDescription}
              style={[styles.input, styles.multiline]}
              textAlignVertical="top"
              value={activityDescription}
            />
            <Text style={styles.label}>Desde (AAAA-MM)</Text>
            <TextInput
              accessibilityLabel="Mes de inicio de la actividad"
              autoCapitalize="none"
              editable={!busy}
              maxLength={7}
              onChangeText={setActivityStartedOn}
              placeholder="2026-03"
              style={styles.input}
              value={activityStartedOn}
            />
            <Text style={styles.label}>Hasta (AAAA-MM, opcional)</Text>
            <TextInput
              accessibilityLabel="Mes de fin de la actividad"
              autoCapitalize="none"
              editable={!busy}
              maxLength={7}
              onChangeText={setActivityEndedOn}
              placeholder="2026-12"
              style={styles.input}
              value={activityEndedOn}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void addActivity()}
              style={[styles.primaryButton, busy && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>
                {busy ? "Guardando…" : "Agregar actividad"}
              </Text>
            </Pressable>
          </View>
        </>
      )}

      <AccountActions logout={logout} />
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "800",
    color: "#20202a",
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: "#20202a",
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#30303a",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d2d2dc",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#20202a",
    backgroundColor: "#ffffff",
  },
  multiline: {
    minHeight: 96,
  },
  copy: {
    fontSize: 14,
    lineHeight: 21,
    color: "#55555f",
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
    color: "#6b6b75",
  },
  meta: {
    fontSize: 12,
    lineHeight: 18,
    color: "#686875",
  },
  loadingRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  switchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchCopy: {
    flex: 1,
    gap: 2,
  },
  choiceSection: {
    gap: 8,
  },
  choiceList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  choice: {
    minHeight: 42,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9cad4",
    borderRadius: 21,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
  },
  choiceSelected: {
    borderColor: "#352b55",
    backgroundColor: "#352b55",
  },
  choiceText: {
    color: "#383844",
    fontSize: 13,
    fontWeight: "700",
  },
  choiceTextSelected: {
    color: "#ffffff",
  },
  primaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#3446a2",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9cad4",
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
  },
  secondaryButtonText: {
    color: "#292933",
    fontSize: 15,
    fontWeight: "700",
  },
  compactButton: {
    minHeight: 42,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9cad4",
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  compactButtonText: {
    color: "#43366a",
    fontSize: 13,
    fontWeight: "700",
  },
  accountActions: {
    gap: 10,
  },
  logoutButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#24243a",
  },
  logoutButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  activityRow: {
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 12,
  },
  activityCopy: {
    gap: 4,
  },
  activityTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#20202a",
  },
  dangerButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d6a6ad",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  dangerButtonText: {
    color: "#8a1f2f",
    fontSize: 14,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.48,
  },
  success: {
    fontSize: 14,
    lineHeight: 21,
    color: "#17643a",
  },
  error: {
    fontSize: 14,
    lineHeight: 21,
    color: "#9a1d2d",
  },
});
