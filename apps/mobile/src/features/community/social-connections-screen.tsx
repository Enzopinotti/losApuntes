import type { ConnectionView } from "@losapuntes/contracts/social-qa";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Redirect,
  useIsFocused,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useSession } from "@/features/session/session-provider";
import {
  activeNavigationAuthorityKey,
  navigationAuthorityKey,
} from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";

import { NetworkPersonAvatar } from "./network-person-avatar";
import { mobileCommunityApi } from "./community-runtime";
import type { CommunityFailure } from "./community-controller";
import {
  SocialConnectionsController,
  type ConnectionList,
  type SocialConnectionsSnapshot,
} from "./social-connections-controller";

const listTitles: Record<ConnectionList, string> = {
  pending: "Solicitudes",
  accepted: "Conexiones",
};

function failureCopy(failure: CommunityFailure): string {
  if (failure.code === "EMAIL_VERIFICATION_REQUIRED") {
    return "Verificá tu email para gestionar solicitudes y conexiones.";
  }
  if (failure.code === "SOCIAL_CONNECTION_STATE_CONFLICT") {
    return "La relación cambió. Actualizá la lista antes de volver a intentar.";
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
      return "La cuenta no puede realizar esta operación.";
    default:
      return "No pudimos actualizar las conexiones.";
  }
}

function ConnectionCard({
  connection,
  targeted,
  busy,
  reconciliationRequired,
  onOpenProfile,
  onRespond,
  onDisconnect,
}: {
  connection: ConnectionView;
  targeted: boolean;
  busy: boolean;
  reconciliationRequired: boolean;
  onOpenProfile: () => void;
  onRespond: (action: "accept" | "decline") => void;
  onDisconnect: () => void;
}) {
  const pendingIncoming =
    connection.status === "pending" && connection.incoming;
  const pendingOutgoing =
    connection.status === "pending" && connection.requestedByMe;
  const accepted = connection.status === "accepted";

  return (
    <View
      style={[styles.connection, targeted ? styles.connectionTarget : null]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir perfil de ${connection.other.displayName}`}
        onPress={onOpenProfile}
        style={styles.personButton}
      >
        <NetworkPersonAvatar
          avatarUrl={connection.other.avatarUrl}
          displayName={connection.other.displayName}
        />
        <View style={styles.personDetails}>
          <Text style={styles.personName}>{connection.other.displayName}</Text>
          <Text style={styles.copy}>
            {pendingIncoming
              ? "Te envió una solicitud de conexión."
              : pendingOutgoing
                ? "Solicitud enviada. Esperando respuesta."
                : accepted
                  ? "Conexión aceptada."
                  : "Esta relación ya no está activa."}
          </Text>
        </View>
      </Pressable>

      {pendingIncoming ? (
        <View style={styles.actionRow}>
          <ActionButton
            label="Aceptar"
            accessibilityLabel={`Aceptar solicitud de ${connection.other.displayName}`}
            disabled={busy || reconciliationRequired}
            onPress={() => onRespond("accept")}
          />
          <ActionButton
            label="Rechazar"
            accessibilityLabel={`Rechazar solicitud de ${connection.other.displayName}`}
            disabled={busy || reconciliationRequired}
            secondary
            onPress={() => onRespond("decline")}
          />
        </View>
      ) : null}

      {accepted ? (
        <ActionButton
          label="Desconectar"
          accessibilityLabel={`Desconectar a ${connection.other.displayName}`}
          disabled={busy || reconciliationRequired}
          secondary
          onPress={onDisconnect}
        />
      ) : null}

      {busy ? (
        <Text accessibilityLiveRegion="polite" style={styles.meta}>
          Actualizando relación…
        </Text>
      ) : null}
      {reconciliationRequired ? (
        <Text accessibilityRole="alert" style={styles.error}>
          No pudimos confirmar el último cambio. Actualizá la lista antes de
          volver a usar esta acción.
        </Text>
      ) : null}
    </View>
  );
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
        styles.actionButton,
        secondary ? styles.secondaryButton : null,
        pressed && !disabled ? styles.actionPressed : null,
        disabled ? styles.actionDisabled : null,
      ]}
    >
      <Text style={secondary ? styles.secondaryLabel : styles.actionLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function renderConnectionList(
  snapshot: Extract<SocialConnectionsSnapshot, { kind: "ready" }>,
  list: ConnectionList,
  callbacks: {
    onOpenProfile(profileId: string): void;
    onRespond(connectionId: string, action: "accept" | "decline"): void;
    onDisconnect(connection: ConnectionView): void;
    onLoadMore(): void;
  },
) {
  const items = list === "pending" ? snapshot.pending : snapshot.accepted;
  const nextCursor =
    list === "pending"
      ? snapshot.pendingNextCursor
      : snapshot.acceptedNextCursor;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {listTitles[list]}
      </Text>
      {items.length === 0 ? (
        <Text style={styles.copy}>
          {list === "pending"
            ? "No tenés solicitudes de conexión pendientes."
            : "Todavía no tenés conexiones aceptadas."}
        </Text>
      ) : (
        items.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            targeted={snapshot.targetConnectionId === connection.id}
            busy={snapshot.busyConnectionId === connection.id}
            reconciliationRequired={
              snapshot.reconciliationRequiredConnectionId === connection.id
            }
            onOpenProfile={() =>
              callbacks.onOpenProfile(connection.other.profileId)
            }
            onRespond={(action) => callbacks.onRespond(connection.id, action)}
            onDisconnect={() => callbacks.onDisconnect(connection)}
          />
        ))
      )}
      {nextCursor ? (
        <ActionButton
          label={snapshot.loadingMore === list ? "Cargando…" : "Ver más"}
          accessibilityLabel={`Ver más ${list === "pending" ? "solicitudes" : "conexiones"}`}
          disabled={
            snapshot.loadingMore !== null ||
            snapshot.refreshing ||
            snapshot.busyConnectionId !== null
          }
          secondary
          onPress={callbacks.onLoadMore}
        />
      ) : null}
    </View>
  );
}

export function SocialConnectionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ connectionId?: string | string[] }>();
  const targetConnectionId = Array.isArray(params.connectionId)
    ? (params.connectionId[0] ?? null)
    : (params.connectionId ?? null);
  const isFocused = useIsFocused();
  const { snapshot: session, retryRestore } = useSession();
  const [appState, setAppState] = useState(AppState.currentState ?? "active");
  const [snapshot, setSnapshot] = useState<SocialConnectionsSnapshot>({
    kind: "idle",
    authorityKey: null,
  });
  const controller = useMemo(
    () => new SocialConnectionsController(mobileCommunityApi),
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
    if (authorityKey) void controller.load(authorityKey, targetConnectionId);
    return () => controller.invalidate(authorityKey ?? undefined);
  }, [authorityKey, controller, targetConnectionId]);

  const refresh = useCallback(() => {
    if (authorityKey) void controller.load(authorityKey, targetConnectionId);
  }, [authorityKey, controller, targetConnectionId]);

  const openProfile = useCallback(
    (profileId: string) => {
      router.push({
        pathname: "/profiles/[profileId]",
        params: { profileId },
      });
    },
    [router],
  );

  const respond = useCallback(
    (connectionId: string, action: "accept" | "decline") => {
      if (authorityKey)
        void controller.respond(authorityKey, connectionId, action);
    },
    [authorityKey, controller],
  );

  const disconnect = useCallback(
    (connection: ConnectionView) => {
      Alert.alert(
        `Desconectar a ${connection.other.displayName}?`,
        "La relación dejará de aparecer entre tus conexiones.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Desconectar",
            style: "destructive",
            onPress: () => {
              if (authorityKey) {
                void controller.disconnect(authorityKey, connection.id);
              }
            },
          },
        ],
      );
    },
    [authorityKey, controller],
  );

  if (session.kind === "restoring") {
    return (
      <ProductSurface title="Tu red" description="Validando tu sesión.">
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
        ? "La cuenta no puede acceder a las conexiones."
        : session.kind === "offline"
          ? "No hay conexión para validar tu sesión."
          : session.kind === "timeout"
            ? "La validación de tu sesión tardó demasiado."
            : session.kind === "server_unavailable"
              ? "El servicio de sesión no está disponible ahora."
              : "No pudimos validar tu sesión.";
    return (
      <ProductSurface
        title="Tu red"
        description="Las conexiones requieren una sesión validada."
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
      title="Tu red"
      description="Revisá solicitudes y conexiones confirmadas por el servidor."
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
            Cargando tu red…
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
            accessibilityLabel="Reintentar la carga de tu red"
            disabled={!authorityKey}
            onPress={refresh}
          />
        </View>
      ) : null}

      {snapshot.kind === "ready" ? (
        <View style={styles.card}>
          {snapshot.targetConnectionId &&
          !snapshot.pending.some(
            (connection) => connection.id === snapshot.targetConnectionId,
          ) &&
          !snapshot.accepted.some(
            (connection) => connection.id === snapshot.targetConnectionId,
          ) ? (
            <Text accessibilityRole="alert" style={styles.copy}>
              La relación de esta notificación no aparece en las páginas
              cargadas. Actualizá la lista o cargá más solicitudes y conexiones.
            </Text>
          ) : null}

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
                label="Actualizar mi red"
                accessibilityLabel="Reintentar la carga de solicitudes y conexiones"
                disabled={!authorityKey || snapshot.refreshing}
                onPress={refresh}
              />
            </View>
          ) : null}
          {snapshot.reconciliationRequiredConnectionId ? (
            <ActionButton
              label="Revisar estado en el servidor"
              accessibilityLabel="Revisar el estado de la conexión en el servidor"
              disabled={snapshot.refreshing || snapshot.loadingMore !== null}
              onPress={refresh}
            />
          ) : null}

          {renderConnectionList(snapshot, "pending", {
            onOpenProfile: openProfile,
            onRespond: respond,
            onDisconnect: disconnect,
            onLoadMore: () =>
              authorityKey
                ? void controller.loadMore(authorityKey, "pending")
                : undefined,
          })}
          {renderConnectionList(snapshot, "accepted", {
            onOpenProfile: openProfile,
            onRespond: respond,
            onDisconnect: disconnect,
            onLoadMore: () =>
              authorityKey
                ? void controller.loadMore(authorityKey, "accepted")
                : undefined,
          })}

          <ActionButton
            label="Perfiles que sigo"
            accessibilityLabel="Abrir los perfiles que sigo"
            disabled={false}
            secondary
            onPress={() => router.push("/social-following")}
          />
          <ActionButton
            label="Buscar personas"
            accessibilityLabel="Buscar personas para descubrir perfiles"
            disabled={false}
            secondary
            onPress={() => router.push("/(tabs)/search")}
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
    gap: 18,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  feedback: {
    gap: 10,
  },
  section: {
    gap: 12,
    borderTopWidth: 1,
    borderColor: "#e7e7ed",
    paddingTop: 16,
  },
  sectionTitle: {
    color: "#20202a",
    fontSize: 18,
    fontWeight: "800",
  },
  connection: {
    gap: 10,
    borderWidth: 1,
    borderColor: "#e6e5ec",
    borderRadius: 14,
    padding: 14,
  },
  connectionTarget: {
    borderColor: "#6b50a8",
    borderWidth: 2,
  },
  personButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    gap: 12,
  },
  personDetails: {
    flex: 1,
    gap: 5,
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
  meta: {
    color: "#656570",
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: "#9f1d1d",
    fontSize: 14,
    lineHeight: 20,
  },
  success: {
    color: "#17613d",
    fontSize: 14,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#43366a",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#d9d7e2",
    backgroundColor: "#ffffff",
  },
  secondaryLabel: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  actionPressed: {
    opacity: 0.75,
  },
  actionDisabled: {
    opacity: 0.5,
  },
});
