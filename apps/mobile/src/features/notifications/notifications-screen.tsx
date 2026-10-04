import { Redirect, useIsFocused, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { mobileCommunityApi } from "@/features/community/community-runtime";
import type { MobileNotificationView } from "@/features/community/community-api";
import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";

import {
  MOBILE_NOTIFICATION_RECONCILE_INTERVAL_MS,
  MobileNotificationsController,
  shouldReconcileMobileNotifications,
  type MobileNotificationsSnapshot,
} from "./notifications-controller";
const notificationMessage = (notification: MobileNotificationView): string => {
  const actor =
    notification.actor?.displayName ?? "Una persona de la comunidad";
  switch (notification.type) {
    case "social.followed":
      return `${actor} empezó a seguirte.`;
    case "social.connection_requested":
      return `${actor} te envió una solicitud de conexión.`;
    case "social.connection_accepted":
      return `${actor} aceptó tu solicitud de conexión.`;
    case "qa.question_answered":
      return `${actor} respondió tu pregunta.`;
    case "qa.answer_accepted":
      return `${actor} aceptó tu respuesta.`;
  }
};

function notificationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function failureMessage(snapshot: MobileNotificationsSnapshot): string {
  if (snapshot.kind !== "failure" && snapshot.kind !== "ready") {
    return "No pudimos actualizar tus notificaciones.";
  }
  const failure = snapshot.failure;
  if (!failure) return "No pudimos actualizar tus notificaciones.";
  switch (failure.kind) {
    case "offline":
      return "No hay conexión. Tus notificaciones siguen disponibles al volver a conectarte.";
    case "timeout":
      return "La actualización tardó demasiado. Podés reintentar.";
    case "server_unavailable":
      return "El servicio de notificaciones no está disponible ahora.";
    case "restricted":
      return "La cuenta no puede acceder a estas notificaciones.";
    case "auth_required":
      return "La sesión cambió. Iniciá sesión para volver a cargar tus notificaciones.";
    case "error":
      return "No pudimos actualizar tus notificaciones.";
  }
}

export function NotificationsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { snapshot: session, retryRestore } = useSession();
  const [appState, setAppState] = useState(AppState.currentState ?? "active");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const controller = useMemo(
    () => new MobileNotificationsController(mobileCommunityApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<MobileNotificationsSnapshot>(
    controller.getSnapshot(),
  );

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  const authorityKey =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const visible = shouldReconcileMobileNotifications(isFocused, appState);

  useEffect(() => {
    if (!authorityKey) {
      controller.invalidate();
      return;
    }
    if (!visible) {
      if (!isFocused && appState === "active") {
        controller.suspend(authorityKey);
      } else {
        controller.invalidate(authorityKey);
      }
      return;
    }

    const current = controller.getSnapshot();
    if (
      current.kind === "ready" &&
      current.authorityKey === authorityKey &&
      current.unreadOnly === unreadOnly
    ) {
      void controller.reconcile(authorityKey);
    } else {
      void controller.load(authorityKey, unreadOnly);
    }
  }, [authorityKey, appState, controller, isFocused, unreadOnly, visible]);

  useEffect(() => () => controller.invalidate(), [controller]);

  const readyAuthority =
    snapshot.kind === "ready" &&
    snapshot.authorityKey === authorityKey &&
    snapshot.unreadOnly === unreadOnly;
  useEffect(() => {
    if (
      !visible ||
      !authorityKey ||
      snapshot.kind !== "ready" ||
      snapshot.authorityKey !== authorityKey ||
      snapshot.unreadOnly !== unreadOnly
    ) {
      return;
    }

    void controller.reconcile(authorityKey);
    const interval = setInterval(
      () => void controller.reconcile(authorityKey),
      MOBILE_NOTIFICATION_RECONCILE_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [
    authorityKey,
    controller,
    isFocused,
    appState,
    snapshot.kind,
    snapshot.kind === "ready" ? snapshot.authorityKey : null,
    snapshot.kind === "ready" ? snapshot.unreadOnly : null,
    unreadOnly,
    visible,
  ]);

  if (session.kind === "restoring") {
    return (
      <ProductSurface title="Notificaciones" description="Validando tu sesión.">
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
        ? "La cuenta no puede acceder a las notificaciones."
        : session.kind === "offline"
          ? "No hay conexión para validar tu sesión."
          : session.kind === "timeout"
            ? "La validación de tu sesión tardó demasiado."
            : session.kind === "server_unavailable"
              ? "El servicio de sesión no está disponible ahora."
              : "No pudimos validar tu sesión.";
    return (
      <ProductSurface
        title="Notificaciones"
        description="La actividad requiere una sesión validada."
      >
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {message}
          </Text>
          {session.kind !== "restricted" ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void retryRestore()}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonLabel}>Reintentar sesión</Text>
            </Pressable>
          ) : null}
        </View>
      </ProductSurface>
    );
  }

  const data =
    readyAuthority && snapshot.kind === "ready" ? snapshot.data : null;
  const loading =
    !data &&
    (snapshot.kind === "idle" ||
      snapshot.kind === "loading" ||
      (snapshot.kind === "ready" && !readyAuthority));
  const actionBusy = data && snapshot.kind === "ready" && snapshot.actionBusy;
  const retry = () => {
    if (authorityKey && visible) void controller.load(authorityKey, unreadOnly);
  };

  const openNotification = (notification: MobileNotificationView) => {
    if (notification.target.type === "profile" && notification.target.id) {
      router.push({
        pathname: "/profiles/[profileId]",
        params: { profileId: notification.target.id },
      });
    } else if (
      notification.target.type === "question" &&
      notification.target.id
    ) {
      router.push({
        pathname: "/questions/[questionId]",
        params: { questionId: notification.target.id },
      });
    } else if (
      notification.target.type === "answer" ||
      notification.target.type === "connection"
    ) {
      router.push("/(tabs)/network");
    }
  };

  return (
    <ProductSurface
      title="Notificaciones"
      description="Actividad de tu red y de tus preguntas, actualizada desde el servidor mientras esta pantalla está abierta."
      onRefresh={visible && !actionBusy ? retry : undefined}
      refreshing={snapshot.kind === "loading"}
    >
      <View style={styles.card}>
        <View style={styles.filterRow}>
          <View style={styles.filterCopy}>
            <Text style={styles.cardTitle}>Solo sin leer</Text>
            <Text style={styles.copy}>
              Filtrá la lista por actividad pendiente.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Mostrar solo notificaciones sin leer"
            value={unreadOnly}
            disabled={!visible || Boolean(actionBusy)}
            onValueChange={setUnreadOnly}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!data || Boolean(actionBusy)}
          onPress={() => {
            if (authorityKey) void controller.markAllRead(authorityKey);
          }}
          style={({ pressed }) => [
            styles.secondaryButton,
            (!data || actionBusy) && styles.disabledButton,
            pressed && data && !actionBusy && styles.pressedButton,
          ]}
        >
          <Text style={styles.secondaryButtonLabel}>
            {actionBusy ? "Actualizando…" : "Marcar todas como leídas"}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.card}>
          <View style={styles.inline}>
            <ActivityIndicator accessibilityLabel="Cargando notificaciones" />
            <Text style={styles.copy}>Cargando notificaciones…</Text>
          </View>
        </View>
      ) : null}

      {snapshot.kind === "failure" && !data ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {failureMessage(snapshot)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonLabel}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {data ? (
        <View style={styles.card}>
          {data.items.length === 0 ? (
            <Text style={styles.copy}>
              {unreadOnly
                ? "No tenés notificaciones sin leer."
                : "Todavía no hay notificaciones."}
            </Text>
          ) : (
            data.items.map((notification) => (
              <View key={notification.id} style={styles.notification}>
                <View style={styles.notificationCopy}>
                  <Text style={styles.message}>
                    {notificationMessage(notification)}
                  </Text>
                  <Text style={styles.date}>
                    {notificationDate(notification.createdAt)}
                  </Text>
                  {notification.readAt ? (
                    <Text style={styles.readLabel}>Leída</Text>
                  ) : null}
                </View>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Abrir notificación"
                    onPress={() => openNotification(notification)}
                    style={styles.actionButton}
                  >
                    <Text style={styles.actionLabel}>Abrir</Text>
                  </Pressable>
                  {!notification.readAt ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={Boolean(actionBusy)}
                      onPress={() => {
                        if (authorityKey)
                          void controller.markRead(
                            authorityKey,
                            notification.id,
                          );
                      }}
                      style={[
                        styles.actionButton,
                        actionBusy && styles.disabledButton,
                      ]}
                    >
                      <Text style={styles.actionLabel}>Leída</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          )}
          {snapshot.kind === "ready" && snapshot.failure ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {failureMessage(snapshot)}
            </Text>
          ) : null}
          {snapshot.kind === "ready" && snapshot.data.nextCursor ? (
            <Pressable
              accessibilityRole="button"
              disabled={snapshot.loadingMore || Boolean(actionBusy)}
              onPress={() => {
                if (authorityKey) void controller.loadMore(authorityKey);
              }}
              style={[
                styles.secondaryButton,
                (snapshot.loadingMore || actionBusy) && styles.disabledButton,
              ]}
            >
              <Text style={styles.secondaryButtonLabel}>
                {snapshot.loadingMore ? "Cargando…" : "Cargar más"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
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
  cardTitle: {
    color: "#20202a",
    fontSize: 16,
    fontWeight: "700",
  },
  copy: {
    color: "#5b5b66",
    fontSize: 14,
    lineHeight: 20,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  filterCopy: {
    flex: 1,
    gap: 4,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notification: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 14,
  },
  notificationCopy: {
    flex: 1,
    gap: 5,
  },
  message: {
    color: "#20202a",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  date: {
    color: "#70707a",
    fontSize: 12,
  },
  readLabel: {
    color: "#70707a",
    fontSize: 12,
  },
  actions: {
    alignItems: "flex-end",
    gap: 6,
  },
  actionButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: "#f1eff8",
  },
  actionLabel: {
    color: "#43376a",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#d3d1dc",
    borderRadius: 11,
  },
  secondaryButtonLabel: {
    color: "#343247",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.5,
  },
  pressedButton: {
    backgroundColor: "#eceaf3",
  },
  error: {
    color: "#9f1d1d",
    fontSize: 14,
    lineHeight: 20,
  },
});
