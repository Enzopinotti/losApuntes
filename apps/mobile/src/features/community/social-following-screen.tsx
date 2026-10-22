import type { FollowingItem } from "@losapuntes/contracts/social-qa";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect, useIsFocused, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  activeNavigationAuthorityKey,
  navigationAuthorityKey,
} from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";

import type { CommunityFailure } from "./community-controller";
import { mobileCommunityApi } from "./community-runtime";
import {
  SocialFollowingController,
  type SocialFollowingSnapshot,
} from "./social-following-controller";
import { PublicAvatar } from "../profile/public-avatar";

function failureCopy(failure: CommunityFailure): string {
  if (failure.code === "EMAIL_VERIFICATION_REQUIRED") {
    return "Verificá tu email para administrar los perfiles que seguís.";
  }
  switch (failure.kind) {
    case "offline":
      return "No hay conexión. Volvé a intentarlo cuando estés en línea.";
    case "timeout":
      return "La solicitud tardó demasiado. Si estabas dejando de seguir un perfil, podés volver a intentarlo.";
    case "server_unavailable":
      return "El servicio de red no está disponible ahora.";
    case "auth_required":
      return "La sesión venció. Iniciá sesión para continuar.";
    case "restricted":
      return "La cuenta no puede administrar perfiles seguidos.";
    default:
      return "No pudimos actualizar los perfiles que seguís.";
  }
}

function ActionButton({
  label,
  accessibilityLabel,
  disabled,
  secondary = false,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  secondary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondaryButton : null,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text style={secondary ? styles.secondaryLabel : styles.buttonLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function FollowingCard({
  item,
  busy,
  disabled,
  onOpenProfile,
  onUnfollow,
}: {
  item: FollowingItem;
  busy: boolean;
  disabled: boolean;
  onOpenProfile: () => void;
  onUnfollow: () => void;
}) {
  return (
    <View style={styles.person}>
      <View style={styles.personSummary}>
        <PublicAvatar
          avatarUrl={item.profile.avatarUrl}
          displayName={item.profile.displayName}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Abrir perfil de ${item.profile.displayName}`}
          onPress={onOpenProfile}
          style={styles.personDetails}
        >
          <Text style={styles.personName}>{item.profile.displayName}</Text>
          <Text style={styles.copy}>Seguís este perfil.</Text>
        </Pressable>
      </View>
      <ActionButton
        label={busy ? "Actualizando…" : "Dejar de seguir"}
        accessibilityLabel={`Dejar de seguir a ${item.profile.displayName}`}
        disabled={disabled || busy}
        secondary
        onPress={onUnfollow}
      />
    </View>
  );
}

export function SocialFollowingScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { snapshot: session, retryRestore } = useSession();
  const [appState, setAppState] = useState(AppState.currentState ?? "active");
  const [snapshot, setSnapshot] = useState<SocialFollowingSnapshot>({
    kind: "idle",
  });
  const controller = useMemo(
    () => new SocialFollowingController(mobileCommunityApi),
    [],
  );
  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey = activeNavigationAuthorityKey(
    sessionAuthority,
    isFocused,
    appState,
  );

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    controller.setAuthority(authorityKey);
    if (authorityKey) void controller.load(authorityKey);
    return () => controller.invalidate(authorityKey ?? undefined);
  }, [authorityKey, controller]);

  const refresh = useCallback(() => {
    if (authorityKey) void controller.load(authorityKey);
  }, [authorityKey, controller]);
  const openProfile = useCallback(
    (profileId: string) => {
      router.push({ pathname: "/profiles/[profileId]", params: { profileId } });
    },
    [router],
  );
  const unfollow = useCallback(
    (profileId: string) => {
      if (authorityKey) void controller.unfollow(authorityKey, profileId);
    },
    [authorityKey, controller],
  );

  if (session.kind === "restoring") {
    return (
      <ProductSurface
        title="Perfiles que sigo"
        description="Validando tu sesión."
      >
        <View style={styles.card}>
          <ActivityIndicator accessibilityLabel="Validando sesión" />
        </View>
      </ProductSurface>
    );
  }
  if (session.kind === "unauthenticated") return <Redirect href="/sign-in" />;
  if (session.kind !== "authenticated") {
    const message =
      session.kind === "restricted"
        ? "La cuenta no puede acceder a los perfiles seguidos."
        : session.kind === "offline"
          ? "No hay conexión para validar tu sesión."
          : session.kind === "timeout"
            ? "La validación de tu sesión tardó demasiado."
            : session.kind === "server_unavailable"
              ? "El servicio de sesión no está disponible ahora."
              : "No pudimos validar tu sesión.";
    return (
      <ProductSurface
        title="Perfiles que sigo"
        description="La red requiere una sesión validada."
      >
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {message}
          </Text>
          {session.kind !== "restricted" ? (
            <ActionButton
              label="Reintentar sesión"
              accessibilityLabel="Reintentar la validación de sesión"
              disabled={false}
              onPress={() => void retryRestore()}
            />
          ) : null}
        </View>
      </ProductSurface>
    );
  }

  return (
    <ProductSurface
      title="Perfiles que sigo"
      description="Seguir expresa interés y no crea una conexión."
      onRefresh={authorityKey ? refresh : undefined}
      refreshing={snapshot.kind === "ready" && snapshot.refreshing}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backLabel}>Volver</Text>
      </Pressable>

      {snapshot.kind === "idle" || snapshot.kind === "loading" ? (
        <View style={styles.card}>
          <Text accessibilityLiveRegion="polite" style={styles.copy}>
            Cargando perfiles que seguís…
          </Text>
        </View>
      ) : null}

      {snapshot.kind === "failure" ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {failureCopy(snapshot.failure)}
          </Text>
          <ActionButton
            label="Reintentar"
            accessibilityLabel="Reintentar la carga de los perfiles seguidos"
            disabled={!authorityKey}
            onPress={refresh}
          />
        </View>
      ) : null}

      {snapshot.kind === "ready" ? (
        <View style={styles.card}>
          {snapshot.notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.success}>
              {snapshot.notice}
            </Text>
          ) : null}
          {snapshot.failure ? (
            <View style={styles.feedback}>
              <Text accessibilityRole="alert" style={styles.error}>
                {failureCopy(snapshot.failure)}
              </Text>
              <ActionButton
                label="Actualizar lista"
                accessibilityLabel="Actualizar los perfiles que sigo"
                disabled={!authorityKey || snapshot.refreshing}
                onPress={refresh}
                secondary
              />
            </View>
          ) : null}
          {snapshot.items.length === 0 ? (
            <Text style={styles.copy}>
              {snapshot.nextCursor
                ? "No hay más perfiles en esta tanda. Podés cargar la siguiente."
                : "Todavía no seguís perfiles. Encontrá personas desde Buscar."}
            </Text>
          ) : (
            snapshot.items.map((item) => (
              <FollowingCard
                key={item.profile.profileId}
                item={item}
                busy={snapshot.busyProfileId === item.profile.profileId}
                disabled={
                  snapshot.busyProfileId !== null ||
                  snapshot.refreshing ||
                  snapshot.loadingMore
                }
                onOpenProfile={() => openProfile(item.profile.profileId)}
                onUnfollow={() => unfollow(item.profile.profileId)}
              />
            ))
          )}
          {snapshot.nextCursor ? (
            <ActionButton
              label={snapshot.loadingMore ? "Cargando…" : "Cargar más perfiles"}
              accessibilityLabel="Cargar más perfiles que sigo"
              disabled={
                snapshot.loadingMore ||
                snapshot.refreshing ||
                snapshot.busyProfileId !== null
              }
              secondary
              onPress={() => {
                if (authorityKey) void controller.loadMore(authorityKey);
              }}
            />
          ) : null}
          <ActionButton
            label="Volver a Tu red"
            accessibilityLabel="Volver a solicitudes y conexiones"
            disabled={false}
            secondary
            onPress={() => router.push("/social-connections")}
          />
        </View>
      ) : null}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  backButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
  },
  backLabel: {
    color: "#43366a",
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    gap: 14,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  person: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#eceaf1",
    paddingTop: 12,
  },
  personDetails: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
  },
  personSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  personName: {
    color: "#20202a",
    fontSize: 16,
    fontWeight: "700",
  },
  copy: {
    color: "#55555f",
    fontSize: 14,
    lineHeight: 21,
  },
  feedback: {
    gap: 10,
  },
  error: {
    color: "#9f1d1d",
    fontSize: 14,
    lineHeight: 21,
  },
  success: {
    color: "#17613d",
    fontSize: 14,
    lineHeight: 21,
  },
  button: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#43366a",
    paddingHorizontal: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#d9d7e2",
    backgroundColor: "#ffffff",
  },
  buttonLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryLabel: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
