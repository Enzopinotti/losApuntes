import type {
  ProfileSection,
  PublicProfileResponse,
  ResourceView,
} from "@losapuntes/contracts";
import { Redirect, useIsFocused, useRouter } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type {
  DetailFailureKind,
  FencedDetailSnapshot,
} from "./use-fenced-detail";

import {
  activeNavigationAuthorityKey,
  navigationAuthorityKey,
} from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";
import {
  SocialProfileConnectionAction,
  SocialProfileFollowAction,
} from "@/features/community/social-profile-connection-action";

import { mobileSearchApi } from "./search-runtime";
import { publicProfileAcademicSummary } from "./public-profile-academic-summary";
import { publicProfileContentSectionOrder } from "./public-profile-section-order";
import type { PublicProfileContentSection } from "./public-profile-section-order";
import { useFencedDetail } from "./use-fenced-detail";

const errorCopy: Record<DetailFailureKind, string> = {
  offline: "No hay conexión. Volvé a intentarlo cuando estés en línea.",
  timeout: "El servidor tardó demasiado en responder.",
  server_unavailable: "Este contenido no está disponible ahora.",
  forbidden: "Ya no tenés permiso para acceder a este contenido.",
  not_found: "Este contenido ya no está disponible o dejó de ser visible.",
  restricted: "La cuenta no puede acceder a este contenido.",
  error: "No pudimos cargar este contenido.",
};

function useActiveAppState() {
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
    });
    return () => subscription.remove();
  }, []);

  return appState;
}

function DetailsFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <ProductSurface title={title} description={description}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backLabel}>Volver a Buscar</Text>
      </Pressable>
      {children}
    </ProductSurface>
  );
}

function DetailState<T>({
  snapshot,
  authorityKey,
  onRetry,
  children,
}: {
  snapshot: FencedDetailSnapshot<T>;
  authorityKey: string | null;
  onRetry: () => void;
  children: (data: T) => ReactNode;
}) {
  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;
  if (current?.kind === "ready") return children(current.data);
  if (!current || current.kind === "loading") {
    return (
      <View style={styles.card}>
        <View style={styles.loadingRow}>
          <ActivityIndicator accessibilityLabel="Cargando contenido" />
          <Text style={styles.copy}>Cargando contenido autorizado…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text accessibilityRole="alert" style={styles.error}>
        {errorCopy[current.kind]}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={styles.retryButton}
      >
        <Text style={styles.retryLabel}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

export function ResourceDetailsScreen({ resourceId }: { resourceId: string }) {
  const { snapshot: session } = useSession();
  const isFocused = useIsFocused();
  const appState = useActiveAppState();
  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const scopeKey =
    sessionAuthority && resourceId
      ? `${sessionAuthority}:resource:${resourceId}`
      : null;
  const authorityKey = activeNavigationAuthorityKey(
    scopeKey,
    isFocused,
    appState,
  );
  const load = useCallback(
    (signal: AbortSignal) => mobileSearchApi.resource(resourceId, signal),
    [resourceId],
  );
  const { snapshot, retry } = useFencedDetail(authorityKey, load);

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;
  if (!resourceId) {
    return (
      <DetailsFrame
        title="Recurso"
        description="No pudimos reconocer el recurso solicitado."
      >
        <View style={styles.card}>
          <Text style={styles.copy}>Volvé a Buscar y elegí un resultado.</Text>
        </View>
      </DetailsFrame>
    );
  }

  return (
    <DetailsFrame
      title="Recurso"
      description="Los datos se vuelven a consultar al servidor antes de mostrarse."
    >
      <DetailState
        snapshot={snapshot}
        authorityKey={authorityKey}
        onRetry={retry}
      >
        {({ resource }: { resource: ResourceView }) => (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>
              {resource.title}
            </Text>
            <Text style={styles.meta}>{resource.academic.subject.name}</Text>
            {resource.academic.courseOffering ? (
              <Text style={styles.meta}>
                {resource.academic.courseOffering.name}
              </Text>
            ) : null}
            {resource.author ? (
              <Text style={styles.meta}>Por {resource.author.displayName}</Text>
            ) : null}
            {resource.description ? (
              <Text style={styles.copy}>{resource.description}</Text>
            ) : (
              <Text style={styles.copy}>
                Este recurso no tiene descripción.
              </Text>
            )}
            {resource.tags.length > 0 ? (
              <Text style={styles.meta}>
                Etiquetas: {resource.tags.join(", ")}
              </Text>
            ) : null}
            <Text style={styles.meta}>
              Archivo: {resource.file.filename} · {resource.file.mimeType}
            </Text>
          </View>
        )}
      </DetailState>
    </DetailsFrame>
  );
}

function PublicProfileSections({
  profile,
}: {
  profile: PublicProfileResponse["profile"];
}) {
  const availableSections = new Set<ProfileSection>();
  if (profile.professional) availableSections.add("professional");
  if (profile.academic) availableSections.add("academic");
  if (profile.learning) availableSections.add("learning");
  if (profile.skills) availableSections.add("skills");
  if (profile.activities !== undefined) availableSections.add("activities");

  const orderedSections = publicProfileContentSectionOrder(
    profile.presentation.sectionOrder,
    availableSections,
  );

  return (
    <>
      {orderedSections.map((section) => {
        switch (section) {
          case "professional":
            return profile.professional ? (
              <View key={section} style={styles.card}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  Proyección profesional
                </Text>
                <Text style={styles.meta}>
                  {profile.professional.headline ?? "Sin titular publicado"}
                </Text>
              </View>
            ) : null;
          case "academic":
            return profile.academic ? (
              <View key={section} style={styles.card}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  Trayectoria académica
                </Text>
                {publicProfileAcademicSummary(profile.academic).map((line) => (
                  <Text key={line} style={styles.meta}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null;
          case "learning":
            return profile.learning ? (
              <View key={section} style={styles.card}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  Aprendizaje
                </Text>
                <Text style={styles.meta}>
                  Está aprendiendo:{" "}
                  {profile.learning.learningTopics.join(", ") ||
                    "Sin temas publicados"}
                </Text>
                <Text style={styles.meta}>
                  Puede ayudar con:{" "}
                  {profile.learning.helpTopics.join(", ") ||
                    "Sin temas publicados"}
                </Text>
              </View>
            ) : null;
          case "skills":
            return profile.skills ? (
              <View key={section} style={styles.card}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  Habilidades e intereses
                </Text>
                <Text style={styles.meta}>
                  {profile.skills.skills.length
                    ? `Habilidades: ${profile.skills.skills.join(", ")}`
                    : "Sin habilidades publicadas"}
                </Text>
              </View>
            ) : null;
          case "activities":
            return profile.activities ? (
              <View key={section} style={styles.card}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  Actividad pública
                </Text>
                {profile.activities.length ? (
                  profile.activities.map((activity) => (
                    <Text key={activity.id} style={styles.copy}>
                      {activity.title}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.meta}>
                    Todavía no hay actividad pública.
                  </Text>
                )}
                {profile.activitiesNextCursor ? (
                  <Text style={styles.meta}>
                    Se muestra una tanda; hay más actividad disponible.
                  </Text>
                ) : null}
              </View>
            ) : null;
        }
      })}
    </>
  );
}

export function PublicProfileScreen({ profileId }: { profileId: string }) {
  const { snapshot: session } = useSession();
  const isFocused = useIsFocused();
  const appState = useActiveAppState();
  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const scopeKey =
    sessionAuthority && profileId
      ? `${sessionAuthority}:profile:${profileId}`
      : null;
  const authorityKey = activeNavigationAuthorityKey(
    scopeKey,
    isFocused,
    appState,
  );
  const load = useCallback(
    (signal: AbortSignal) => mobileSearchApi.publicProfile(profileId, signal),
    [profileId],
  );
  const { snapshot, retry } = useFencedDetail(authorityKey, load);

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;
  if (!profileId) {
    return (
      <DetailsFrame
        title="Perfil público"
        description="No pudimos reconocer este perfil."
      >
        <View style={styles.card}>
          <Text style={styles.copy}>Volvé a Buscar y elegí un resultado.</Text>
        </View>
      </DetailsFrame>
    );
  }

  return (
    <DetailsFrame
      title="Perfil público"
      description="Sólo se muestran las secciones que el servidor habilitó para este perfil."
    >
      <DetailState
        snapshot={snapshot}
        authorityKey={authorityKey}
        onRetry={retry}
      >
        {(data: PublicProfileResponse) => (
          <View style={styles.profileContent}>
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.title}>
                {data.profile.about?.displayName ?? "Perfil"}
              </Text>
              {data.profile.about?.bio ? (
                <Text style={styles.copy}>{data.profile.about.bio}</Text>
              ) : null}
            </View>
            <PublicProfileSections profile={data.profile} />
            <SocialProfileConnectionAction
              profileId={profileId}
              displayName={data.profile.about?.displayName ?? "este perfil"}
            />
            <SocialProfileFollowAction profileId={profileId} />
          </View>
        )}
      </DetailState>
    </DetailsFrame>
  );
}

const styles = StyleSheet.create({
  profileContent: {
    gap: 12,
  },
  backButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  backLabel: {
    color: "#43366a",
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    gap: 12,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: "#20202a",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: {
    fontSize: 14,
    lineHeight: 21,
    color: "#55555f",
  },
  meta: {
    fontSize: 13,
    lineHeight: 19,
    color: "#656570",
  },
  loadingRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
  retryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
  },
  retryLabel: {
    color: "#24243a",
    fontSize: 15,
    fontWeight: "700",
  },
});
