import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import {
  activeNavigationAuthorityKey,
  navigationAuthorityKey,
} from "@/features/navigation/product-navigation";
import { useSession } from "@/features/session/session-provider";

import type { CommunityFailure } from "./community-controller";
import { mobileCommunityApi } from "./community-runtime";
import {
  SocialProfileActionsController,
  socialProfileConnectionNotice,
  type SocialProfileActionsSnapshot,
} from "./social-profile-actions-controller";

function failureCopy(failure: CommunityFailure): string {
  switch (failure.code) {
    case "EMAIL_VERIFICATION_REQUIRED":
      return "Verificá tu email para enviar solicitudes de conexión.";
    case "SOCIAL_PROFILE_REQUIRED":
      return "Completá tu perfil antes de solicitar una conexión.";
    case "SOCIAL_SELF_RELATION_INVALID":
      return "No podés solicitar una conexión con tu propio perfil.";
    case "SOCIAL_PROFILE_NOT_FOUND":
      return "Este perfil ya no está disponible.";
  }
  switch (failure.kind) {
    case "offline":
      return "No hay conexión. Volvé a intentarlo cuando estés en línea.";
    case "timeout":
      return "La solicitud tardó demasiado. Podés volver a intentar.";
    case "server_unavailable":
      return "El servicio de conexiones no está disponible ahora.";
    case "auth_required":
      return "La sesión venció. Iniciá sesión para continuar.";
    case "restricted":
      return "La cuenta no puede iniciar esta conexión.";
    default:
      return "No pudimos enviar la solicitud. Podés volver a intentar.";
  }
}

function followFailureCopy(failure: CommunityFailure): string {
  if (failure.code === "EMAIL_VERIFICATION_REQUIRED") {
    return "Verificá tu email para seguir perfiles.";
  }
  if (failure.code === "SOCIAL_PROFILE_REQUIRED") {
    return "Completá tu perfil antes de seguir a otras personas.";
  }
  switch (failure.kind) {
    case "offline":
      return "No hay conexión. Volvé a intentarlo cuando estés en línea.";
    case "timeout":
      return "No pudimos confirmar si ya seguís este perfil. Podés reintentar.";
    case "server_unavailable":
      return "El servicio de red no está disponible ahora.";
    case "auth_required":
      return "La sesión venció. Iniciá sesión para continuar.";
    case "restricted":
      return "La cuenta no puede seguir perfiles.";
    default:
      return "No pudimos seguir este perfil. Podés volver a intentar.";
  }
}

function useSocialProfileActions(profileId: string) {
  const isFocused = useIsFocused();
  const { snapshot: session } = useSession();
  const [appState, setAppState] = useState(AppState.currentState ?? "active");
  const controller = useMemo(
    () => new SocialProfileActionsController(mobileCommunityApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<SocialProfileActionsSnapshot>(
    controller.getSnapshot(),
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
    controller.setAuthority(authorityKey, profileId);
    if (authorityKey) void controller.loadRelationship(authorityKey);
    return () => controller.invalidate(authorityKey ?? undefined);
  }, [authorityKey, controller, profileId]);

  return { authorityKey, controller, session, snapshot };
}

export function SocialProfileRelationshipActions({
  profileId,
  displayName,
}: {
  profileId: string;
  displayName: string;
}) {
  const router = useRouter();
  const { authorityKey, controller, session, snapshot } =
    useSocialProfileActions(profileId);

  if (
    session.kind !== "authenticated" ||
    !authorityKey ||
    snapshot.kind !== "ready" ||
    snapshot.authorityKey !== authorityKey ||
    snapshot.profileId !== profileId
  ) {
    return null;
  }

  if (snapshot.relationshipLoading) {
    return (
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Tu relación con {displayName}
        </Text>
        <View style={styles.progress}>
          <ActivityIndicator accessibilityLabel="Consultando la relación" />
          <Text style={styles.copy}>Consultando la relación…</Text>
        </View>
      </View>
    );
  }

  if (snapshot.relationshipFailure) {
    return (
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Tu relación con {displayName}
        </Text>
        <Text accessibilityRole="alert" style={styles.error}>
          {relationshipFailureCopy(snapshot.relationshipFailure)}
        </Text>
        <ActionButton
          label="Reintentar lectura"
          accessibilityLabel="Volver a consultar la relación con este perfil"
          disabled={snapshot.busy || snapshot.reconciling}
          onPress={() => void controller.loadRelationship(authorityKey)}
          secondary
        />
      </View>
    );
  }

  if (!snapshot.relationshipLoaded || snapshot.isSelf) {
    return snapshot.isSelf ? (
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Tu perfil
        </Text>
        <Text style={styles.copy}>
          Las acciones de seguimiento y conexión no aplican a tu propio perfil.
        </Text>
      </View>
    ) : null;
  }

  const connection = snapshot.connection;
  const canRequest =
    !connection ||
    connection.status === "declined" ||
    connection.status === "disconnected";
  const requestDisabled =
    !canRequest ||
    snapshot.busy ||
    snapshot.reconciling ||
    snapshot.reconciliationRequired;

  return (
    <>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Tu relación con {displayName}
        </Text>
        <Text style={styles.copy}>
          {snapshot.following
            ? `Seguís a ${displayName}.`
            : `Todavía no seguís a ${displayName}.`}
        </Text>
        <Text style={styles.copy}>
          {snapshot.followsYou
            ? `${displayName} también te sigue.`
            : `${displayName} todavía no te sigue.`}
        </Text>
        <Text style={styles.copy}>
          {connection
            ? socialProfileConnectionNotice(connection)
            : "Todavía no tienen una conexión."}
        </Text>
      </View>

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Conectar
        </Text>
        <Text style={styles.copy}>
          Una conexión requiere que ambas personas la acepten.
        </Text>
        {snapshot.notice ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {snapshot.notice}
          </Text>
        ) : null}
        {snapshot.failure ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {failureCopy(snapshot.failure)}
          </Text>
        ) : null}
        {snapshot.busy || snapshot.reconciling ? (
          <View style={styles.progress}>
            <ActivityIndicator
              accessibilityLabel={
                snapshot.reconciling
                  ? "Verificando la solicitud"
                  : "Enviando solicitud de conexión"
              }
            />
            <Text style={styles.copy}>
              {snapshot.reconciling
                ? "Verificando el estado con el servidor…"
                : "Enviando solicitud…"}
            </Text>
          </View>
        ) : null}

        {snapshot.reconciliationRequired ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>
              No pudimos confirmar la última solicitud. Revisá Tu red antes de
              volver a intentar.
            </Text>
            <ActionButton
              label="Revisar estado"
              accessibilityLabel="Revisar el estado de la solicitud en el servidor"
              disabled={snapshot.reconciling}
              onPress={() => void controller.reconcile(authorityKey)}
              secondary
            />
            <ActionButton
              label="Abrir mi red"
              accessibilityLabel="Abrir solicitudes y conexiones"
              disabled={false}
              onPress={() => router.push("/social-connections")}
              secondary
            />
          </>
        ) : null}

        {connection?.status === "pending" && connection.incoming ? (
          <ActionButton
            label="Responder en Tu red"
            accessibilityLabel={`Responder la solicitud de ${displayName}`}
            disabled={false}
            onPress={() =>
              router.push({
                pathname: "/social-connections",
                params: { connectionId: connection.id },
              })
            }
          />
        ) : null}

        {canRequest ? (
          <ActionButton
            label={
              snapshot.busy
                ? "Enviando…"
                : connection
                  ? "Enviar nueva solicitud"
                  : "Solicitar conexión"
            }
            accessibilityLabel={`Solicitar conexión con ${displayName}`}
            disabled={requestDisabled}
            onPress={() => void controller.requestConnection(authorityKey)}
          />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Seguir perfil
        </Text>
        <Text style={styles.copy}>
          Seguir expresa interés; no crea una conexión ni cambia qué secciones
          podés ver.
        </Text>
        {snapshot.followNotice ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {snapshot.followNotice}
          </Text>
        ) : null}
        {snapshot.followFailure ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {followFailureCopy(snapshot.followFailure)}
          </Text>
        ) : null}
        {snapshot.following ? (
          <>
            <ActionButton
              label={
                snapshot.followBusy ? "Dejando de seguir…" : "Dejar de seguir"
              }
              accessibilityLabel={`Dejar de seguir a ${displayName}`}
              disabled={
                snapshot.followBusy || snapshot.busy || snapshot.reconciling
              }
              secondary
              onPress={() => void controller.unfollowProfile(authorityKey)}
            />
            <ActionButton
              label="Administrar perfiles que sigo"
              accessibilityLabel="Administrar los perfiles que sigo"
              disabled={false}
              secondary
              onPress={() => router.push("/social-following")}
            />
          </>
        ) : (
          <ActionButton
            label={
              snapshot.followBusy
                ? "Siguiendo…"
                : snapshot.followFailure
                  ? "Reintentar"
                  : "Seguir"
            }
            accessibilityLabel="Seguir este perfil"
            disabled={
              snapshot.followBusy || snapshot.busy || snapshot.reconciling
            }
            onPress={() => void controller.followProfile(authorityKey)}
          />
        )}
      </View>
    </>
  );
}

function relationshipFailureCopy(failure: CommunityFailure): string {
  if (failure.code === "SOCIAL_RELATIONSHIP_PROFILE_NOT_FOUND") {
    return "Este perfil ya no está disponible.";
  }
  switch (failure.kind) {
    case "offline":
      return "No hay conexión. Volvé a consultar cuando estés en línea.";
    case "timeout":
      return "La consulta tardó demasiado. Podés volver a intentarlo.";
    case "auth_required":
      return "La sesión venció. Iniciá sesión para continuar.";
    case "restricted":
      return "La cuenta no puede consultar relaciones ahora.";
    default:
      return "No pudimos consultar la relación ahora.";
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

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#ffffff",
  },
  title: {
    color: "#20202a",
    fontSize: 17,
    fontWeight: "800",
  },
  copy: {
    color: "#55555f",
    fontSize: 14,
    lineHeight: 21,
  },
  notice: {
    color: "#17613d",
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: "#9f1d1d",
    fontSize: 14,
    lineHeight: 20,
  },
  progress: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
