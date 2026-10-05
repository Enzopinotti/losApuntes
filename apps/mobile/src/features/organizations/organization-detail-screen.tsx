import type {
  OrganizationDetail,
  OrganizationEvent,
  OrganizationPost,
} from "@losapuntes/contracts";
import { Redirect, useIsFocused, useRouter } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect, useMemo, useState } from "react";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";

import {
  MobileOrganizationDetailController,
  type MobileOrganizationDetailSnapshot,
  type MobileOrganizationsFailure,
} from "./organizations-controller";
import { mobileOrganizationsApi } from "./organizations-runtime";

function failureMessage(failure: MobileOrganizationsFailure): string {
  if (failure.kind === "not_found") {
    return "Esta organización no existe o ya no está disponible.";
  }
  if (failure.kind === "offline") return "No hay conexión.";
  if (failure.kind === "timeout") {
    return "El servidor tardó demasiado en responder.";
  }
  if (failure.kind === "server_unavailable") {
    return "La organización no está disponible ahora.";
  }
  if (failure.kind === "auth_required") {
    return "La sesión cambió. Iniciá sesión nuevamente.";
  }
  if (failure.kind === "restricted") {
    return "La cuenta no puede acceder a esta organización.";
  }
  return "No pudimos completar la operación.";
}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function PostCard({ post }: { post: OrganizationPost }) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemTitle}>{post.title ?? "Publicación"}</Text>
      <Text style={styles.copy}>{post.body}</Text>
      {post.academic ? (
        <Text style={styles.meta}>{post.academic.subject.name}</Text>
      ) : null}
      <Text style={styles.meta}>
        Fuente: {post.source.organization.name}
        {post.source.organization.verificationState === "verified"
          ? " · verificada"
          : ""}
      </Text>
    </View>
  );
}

function EventCard({
  event,
  onOpenExternal,
}: {
  event: OrganizationEvent;
  onOpenExternal: (url: string) => void;
}) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemTitle}>{event.title}</Text>
      {event.description ? <Text style={styles.copy}>{event.description}</Text> : null}
      <Text style={styles.meta}>
        {new Date(event.startsAt).toLocaleString()}
        {event.endsAt ? ` → ${new Date(event.endsAt).toLocaleString()}` : ""}
      </Text>
      {event.locationLabel ? (
        <Text style={styles.meta}>{event.locationLabel}</Text>
      ) : null}
      {event.state === "cancelled" ? (
        <Text accessibilityRole="alert" style={styles.cancelled}>
          Evento cancelado
        </Text>
      ) : null}
      {event.externalUrl ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Abrir enlace del evento ${event.title}`}
          onPress={() => onOpenExternal(event.externalUrl!)}
          style={styles.inlineAction}
        >
          <Text style={styles.inlineActionText}>Abrir enlace externo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MobileOrganizationDetailScreen({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { snapshot: session } = useSession();
  const controller = useMemo(
    () => new MobileOrganizationDetailController(mobileOrganizationsApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<MobileOrganizationDetailSnapshot>(
    controller.getSnapshot(),
  );
  const [appState, setAppState] = useState(AppState.currentState);
  const [externalError, setExternalError] = useState<string | null>(null);

  const sessionKey =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey =
    sessionKey && organizationId && isFocused && appState === "active"
      ? `${sessionKey}:organization:${organizationId}`
      : null;

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setExternalError(null);

    if (!authorityKey) {
      if (sessionKey) controller.suspend(authorityKey ?? sessionKey);
      else controller.invalidate();
      return;
    }

    void controller.load(authorityKey, organizationId);
    return () => controller.suspend(authorityKey);
  }, [authorityKey, controller, organizationId, sessionKey]);

  useEffect(
    () => () => {
      controller.invalidate();
    },
    [controller],
  );

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;

  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;

  const retry = () => {
    if (authorityKey) void controller.load(authorityKey, organizationId);
  };

  const openExternal = async (url: string) => {
    setExternalError(null);
    if (!isSafeExternalUrl(url)) {
      setExternalError("Este enlace externo no usa HTTP o HTTPS.");
      return;
    }

    try {
      await Linking.openURL(url);
    } catch {
      setExternalError("El dispositivo no pudo abrir este enlace.");
    }
  };

  const organization: OrganizationDetail | null =
    current?.kind === "ready" ? current.organization : null;

  return (
    <ProductSurface
      title={organization?.name ?? "Organización"}
      description="Información publicada por una comunidad del campus. El servidor conserva la autoridad de visibilidad, seguimiento y verificación."
      onRefresh={authorityKey ? retry : undefined}
      refreshing={current?.kind === "loading"}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver al directorio de organizaciones"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backText}>Volver</Text>
      </Pressable>

      {!organizationId ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            No pudimos reconocer esta organización.
          </Text>
        </View>
      ) : !current || current.kind === "loading" ? (
        <View style={styles.card}>
          <View style={styles.loading}>
            <ActivityIndicator accessibilityLabel="Cargando organización" />
            <Text style={styles.copy}>Cargando organización…</Text>
          </View>
        </View>
      ) : current.kind === "failure" ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {failureMessage(current.failure)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.headingRow}>
              <Text accessibilityRole="header" style={styles.title}>
                {current.organization.name}
              </Text>
              {current.organization.verificationState === "verified" ? (
                <Text
                  accessibilityLabel="Organización verificada"
                  style={styles.badge}
                >
                  Verificada
                </Text>
              ) : null}
            </View>
            <Text style={styles.meta}>
              {current.organization.scope.institution.name}
            </Text>
            {current.organization.scope.program ? (
              <Text style={styles.meta}>
                {current.organization.scope.program.name}
              </Text>
            ) : null}
            {current.organization.about ? (
              <Text style={styles.copy}>{current.organization.about}</Text>
            ) : null}
            <Text style={styles.meta}>
              {current.organization.followerCount} seguidores
            </Text>
            {current.organization.verificationState === "verified" ? (
              <Text style={styles.helper}>
                “Verificada” confirma un claim institucional revisado; no
                significa que Los Apuntes respalde su contenido.
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                current.organization.viewer?.following
                  ? `Dejar de seguir ${current.organization.name}`
                  : `Seguir ${current.organization.name}`
              }
              accessibilityState={{ disabled: current.busy !== null }}
              disabled={current.busy !== null}
              onPress={() =>
                authorityKey &&
                void controller.toggleFollow(authorityKey, organizationId)
              }
              style={[
                styles.primaryButton,
                current.busy !== null && styles.disabled,
              ]}
            >
              {current.busy === "follow" ? (
                <ActivityIndicator accessibilityLabel="Actualizando seguimiento" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {current.organization.viewer?.following
                    ? "Dejar de seguir"
                    : "Seguir"}
                </Text>
              )}
            </Pressable>

            {current.organization.websiteUrl ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Abrir sitio web de ${current.organization.name}`}
                onPress={() => void openExternal(current.organization.websiteUrl!)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Sitio web</Text>
              </Pressable>
            ) : null}

            {current.notice ? (
              <Text accessibilityLiveRegion="polite" style={styles.success}>
                {current.notice}
              </Text>
            ) : null}
            {current.failure ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {failureMessage(current.failure)}
              </Text>
            ) : null}
            {externalError ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {externalError}
              </Text>
            ) : null}
          </View>

          {current.organization.links.length > 0 ? (
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Enlaces
              </Text>
              {current.organization.links.map((link) => (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Abrir ${link.label} de ${current.organization.name}`}
                  key={link.id}
                  onPress={() => void openExternal(link.url)}
                  style={styles.rowAction}
                >
                  <Text style={styles.rowActionText}>{link.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {current.organization.featuredResources.length > 0 ? (
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Recursos destacados
              </Text>
              {current.organization.featuredResources.map((resource) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir recurso destacado ${resource.title}`}
                  key={resource.id}
                  onPress={() =>
                    router.push({
                      pathname: "/resources/[id]",
                      params: { id: resource.id },
                    })
                  }
                  style={styles.item}
                >
                  <Text style={styles.itemTitle}>{resource.title}</Text>
                  <Text style={styles.meta}>
                    {resource.academic.subject.name}
                  </Text>
                  {resource.description ? (
                    <Text style={styles.copy}>{resource.description}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Publicaciones
            </Text>
            {current.organization.posts.length === 0 ? (
              <Text style={styles.copy}>Todavía no hay publicaciones.</Text>
            ) : (
              current.organization.posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))
            )}
            {current.organization.postsNextCursor ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: current.busy !== null,
                }}
                disabled={current.busy !== null}
                onPress={() =>
                  authorityKey &&
                  void controller.loadMorePosts(authorityKey, organizationId)
                }
                style={styles.secondaryButton}
              >
                {current.busy === "posts-more" ? (
                  <ActivityIndicator accessibilityLabel="Cargando más publicaciones" />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    Cargar más publicaciones
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Eventos
            </Text>
            {current.organization.events.length === 0 ? (
              <Text style={styles.copy}>No hay eventos publicados.</Text>
            ) : (
              current.organization.events.map((event) => (
                <EventCard
                  event={event}
                  key={event.id}
                  onOpenExternal={(url) => void openExternal(url)}
                />
              ))
            )}
            {current.organization.eventsNextCursor ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: current.busy !== null }}
                disabled={current.busy !== null}
                onPress={() =>
                  authorityKey &&
                  void controller.loadMoreEvents(authorityKey, organizationId)
                }
                style={styles.secondaryButton}
              >
                {current.busy === "events-more" ? (
                  <ActivityIndicator accessibilityLabel="Cargando más eventos" />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    Cargar más eventos
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>

          {current.organization.managers.length > 0 ? (
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Equipo
              </Text>
              {current.organization.managers.map((manager, index) => (
                <View
                  key={manager.profile.profileId ?? `${manager.role}-${index}`}
                  style={styles.item}
                >
                  <Text style={styles.itemTitle}>
                    {manager.profile.displayName}
                  </Text>
                  <Text style={styles.meta}>{manager.role}</Text>
                  {manager.profile.profileId ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Ver perfil de ${manager.profile.displayName}`}
                      onPress={() =>
                        router.push({
                          pathname: "/profiles/[profileId]",
                          params: { profileId: manager.profile.profileId! },
                        })
                      }
                      style={styles.inlineAction}
                    >
                      <Text style={styles.inlineActionText}>Ver perfil</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  backButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  backText: {
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
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    flex: 1,
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
  badge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#eef1ff",
    color: "#3446a2",
    fontSize: 11,
    fontWeight: "800",
  },
  item: {
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 12,
  },
  itemTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: {
    fontSize: 14,
    lineHeight: 21,
    color: "#55555f",
  },
  meta: {
    fontSize: 12,
    lineHeight: 18,
    color: "#686875",
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
    color: "#6b6b75",
  },
  cancelled: {
    color: "#9a1d2d",
    fontSize: 13,
    fontWeight: "700",
  },
  loading: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  primaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#3446a2",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9cad4",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: "#292933",
    fontSize: 15,
    fontWeight: "700",
  },
  rowAction: {
    minHeight: 44,
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 8,
  },
  rowActionText: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  inlineAction: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
  },
  inlineActionText: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.48,
  },
  success: {
    color: "#17643a",
    fontSize: 14,
    lineHeight: 21,
  },
  error: {
    color: "#9a1d2d",
    fontSize: 14,
    lineHeight: 21,
  },
});
