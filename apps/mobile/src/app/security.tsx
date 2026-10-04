import type { AuthSession } from "@losapuntes/contracts";

import { useEffect, useState } from "react";
import { Link, Redirect } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { newPasswordValidationMessage } from "@/features/auth/password-policy";
import {
  MobileSecurityController,
  type SecurityFailure,
} from "@/features/auth/security-controller";
import {
  ProductSurface,
  productSurfaceStyles,
} from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";
import { mobileAuthenticatedApi } from "@/features/session/session-runtime";

const failureCopy: Record<SecurityFailure, string> = {
  invalid_current_password: "La contraseña actual no es correcta.",
  conflict:
    "Tu cuenta cambió mientras hacíamos esta operación. Iniciá sesión de nuevo e intentá otra vez.",
  unauthorized: "Tu sesión ya no está disponible.",
  restricted: "Tu cuenta tiene acceso restringido.",
  offline: "Sin conexión. Revisá internet e intentá de nuevo.",
  timeout: "El servidor tardó demasiado en responder.",
  server_unavailable: "Los Apuntes no está disponible en este momento.",
  rejected: "No pudimos completar la operación. Intentá de nuevo.",
};

const signedOutCopy = {
  current_session_revoked: {
    title: "Sesión cerrada",
    body: "Cerraste esta sesión. Iniciá sesión de nuevo para continuar.",
  },
  all_sessions_revoked: {
    title: "Sesiones cerradas",
    body: "Cerramos Los Apuntes en todos tus dispositivos, incluido este.",
  },
  password_changed: {
    title: "Contraseña actualizada",
    body: "Cerramos tus sesiones anteriores. Iniciá sesión de nuevo para continuar.",
  },
  account_restricted: {
    title: "Cuenta restringida",
    body: "Tu cuenta tiene acceso restringido. No vamos a tratar este estado como una contraseña incorrecta.",
  },
  authority_lost: {
    title: "Sesión no disponible",
    body: "Tu sesión cambió o dejó de ser válida. Iniciá sesión de nuevo.",
  },
} as const;

const formatTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No disponible";

  return parsed.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

export default function SecurityRoute() {
  const { snapshot: session } = useSession();
  const [controller] = useState(
    () => new MobileSecurityController(mobileAuthenticatedApi),
  );
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());
  const authenticatedSessionId =
    session.kind === "authenticated" ? session.session.id : null;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPasswords, setShowNewPasswords] = useState(false);
  const [localPasswordError, setLocalPasswordError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    if (session.kind === "authenticated") {
      void controller.load();
    }
  }, [controller, session.kind, authenticatedSessionId]);

  if (snapshot.kind === "signed_out") {
    const copy = signedOutCopy[snapshot.reason];
    return (
      <ProductSurface title={copy.title} description={copy.body}>
        <Link href="/sign-in" asChild>
          <Pressable accessibilityRole="link" style={styles.primary}>
            <Text style={styles.primaryText}>Iniciar sesión</Text>
          </Pressable>
        </Link>
      </ProductSurface>
    );
  }

  const transitionPending =
    snapshot.kind === "ready" && snapshot.busyAction !== null;

  if (
    session.kind !== "authenticated" &&
    session.kind !== "restoring" &&
    !transitionPending
  ) {
    return <Redirect href="/sign-in" />;
  }

  if (
    session.kind === "restoring" ||
    (transitionPending && session.kind !== "authenticated")
  ) {
    return (
      <ProductSurface
        title="Seguridad"
        description="Actualizando la autoridad de tu cuenta."
      >
        <View style={styles.centered}>
          <ActivityIndicator accessibilityLabel="Actualizando seguridad" />
        </View>
      </ProductSurface>
    );
  }

  const submitPassword = () => {
    controller.clearFeedback();
    setLocalPasswordError(null);

    if (!currentPassword) {
      setLocalPasswordError("Ingresá tu contraseña actual.");
      return;
    }

    const validation = newPasswordValidationMessage(newPassword);
    if (validation !== true) {
      setLocalPasswordError(validation);
      return;
    }

    if (newPassword !== confirmation) {
      setLocalPasswordError("Las contraseñas nuevas no coinciden.");
      return;
    }

    void controller.changePassword({
      currentPassword,
      newPassword,
    });
  };

  const confirmRevokeSession = (target: AuthSession) => {
    Alert.alert(
      target.current ? "Cerrar esta sesión" : "Cerrar sesión",
      target.current
        ? "Vas a cerrar la sesión que estás usando ahora."
        : "Ese dispositivo tendrá que iniciar sesión de nuevo.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar sesión",
          style: "destructive",
          onPress: () => void controller.revokeSession(target),
        },
      ],
    );
  };

  const confirmRevokeAll = () => {
    Alert.alert(
      "Cerrar todas las sesiones",
      "Vas a cerrar Los Apuntes en todos tus dispositivos, incluido este.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar todas",
          style: "destructive",
          onPress: () => void controller.revokeAllSessions(),
        },
      ],
    );
  };

  return (
    <ProductSurface
      title="Seguridad"
      description="Controlá tu contraseña y dónde está abierta tu cuenta sin exponer datos sensibles del dispositivo."
      onRefresh={
        snapshot.kind === "ready" && snapshot.busyAction === null
          ? () => void controller.load()
          : undefined
      }
      refreshing={snapshot.kind === "loading"}
    >
      {snapshot.kind === "loading" || snapshot.kind === "idle" ? (
        <View style={styles.centered}>
          <ActivityIndicator accessibilityLabel="Cargando seguridad" />
          <Text style={styles.muted}>Cargando seguridad…</Text>
        </View>
      ) : null}

      {snapshot.kind === "failed" ? (
        <View style={productSurfaceStyles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {failureCopy[snapshot.failure]}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void controller.load()}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {snapshot.kind === "ready" ? (
        <>
          {snapshot.feedback ? (
            <Text accessibilityLiveRegion="polite" style={styles.success}>
              {snapshot.feedback}
            </Text>
          ) : null}

          {snapshot.failure ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {failureCopy[snapshot.failure]}
            </Text>
          ) : null}

          <View style={productSurfaceStyles.card}>
            <Text style={productSurfaceStyles.cardTitle}>Contraseña</Text>
            <Text style={productSurfaceStyles.cardCopy}>
              Al cambiarla, cerraremos tus sesiones actuales por seguridad.
            </Text>

            <Text style={styles.label}>Contraseña actual</Text>
            <TextInput
              accessibilityLabel="Contraseña actual"
              autoCapitalize="none"
              autoComplete="current-password"
              editable={snapshot.busyAction === null}
              secureTextEntry={!showCurrentPassword}
              textContentType="password"
              value={currentPassword}
              onChangeText={(value) => {
                setCurrentPassword(value);
                setLocalPasswordError(null);
                controller.clearFeedback();
              }}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showCurrentPassword
                  ? "Ocultar contraseña actual"
                  : "Mostrar contraseña actual"
              }
              onPress={() => setShowCurrentPassword((visible) => !visible)}
              style={styles.passwordVisibility}
            >
              <Text style={styles.passwordVisibilityText}>
                {showCurrentPassword ? "Ocultar" : "Mostrar"}
              </Text>
            </Pressable>

            <Text style={styles.label}>Nueva contraseña</Text>
            <TextInput
              accessibilityLabel="Nueva contraseña"
              autoCapitalize="none"
              autoComplete="new-password"
              editable={snapshot.busyAction === null}
              secureTextEntry={!showNewPasswords}
              textContentType="newPassword"
              value={newPassword}
              onChangeText={(value) => {
                setNewPassword(value);
                setLocalPasswordError(null);
                controller.clearFeedback();
              }}
              style={styles.input}
            />

            <Text style={styles.label}>Repetir nueva contraseña</Text>
            <TextInput
              accessibilityLabel="Repetir nueva contraseña"
              autoCapitalize="none"
              autoComplete="new-password"
              editable={snapshot.busyAction === null}
              secureTextEntry={!showNewPasswords}
              textContentType="newPassword"
              value={confirmation}
              onChangeText={(value) => {
                setConfirmation(value);
                setLocalPasswordError(null);
                controller.clearFeedback();
              }}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showNewPasswords
                  ? "Ocultar contraseñas nuevas"
                  : "Mostrar contraseñas nuevas"
              }
              onPress={() => setShowNewPasswords((visible) => !visible)}
              style={styles.passwordVisibility}
            >
              <Text style={styles.passwordVisibilityText}>
                {showNewPasswords ? "Ocultar" : "Mostrar"}
              </Text>
            </Pressable>

            {localPasswordError ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {localPasswordError}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={snapshot.busyAction !== null}
              onPress={submitPassword}
              style={[
                styles.primary,
                snapshot.busyAction !== null && styles.disabled,
              ]}
            >
              {snapshot.busyAction === "password" ? (
                <ActivityIndicator accessibilityLabel="Cambiando contraseña" />
              ) : (
                <Text style={styles.primaryText}>Cambiar contraseña</Text>
              )}
            </Pressable>
          </View>

          <View style={productSurfaceStyles.card}>
            <Text style={productSurfaceStyles.cardTitle}>Sesiones activas</Text>
            <Text style={productSurfaceStyles.cardCopy}>
              Mostramos sólo tipo de cliente y tiempos de sesión. No mostramos
              IP, ubicación precisa ni huellas del dispositivo.
            </Text>

            {snapshot.truncated ? (
              <Text accessibilityLiveRegion="polite" style={styles.notice}>
                Mostramos hasta {snapshot.limit} sesiones. Puede haber otras
                sesiones activas; “Cerrar todas” también las revoca.
              </Text>
            ) : null}

            {snapshot.sessions.length === 0 ? (
              <Text style={styles.muted}>
                No hay sesiones activas para mostrar.
              </Text>
            ) : (
              snapshot.sessions.map((item) => (
                <View key={item.id} style={styles.sessionCard}>
                  <Text style={styles.sessionTitle}>
                    {item.clientType === "web" ? "Web" : "Mobile"}
                    {item.current ? " · Esta sesión" : ""}
                  </Text>
                  <Text style={styles.sessionMeta}>
                    Creada: {formatTime(item.createdAt)}
                  </Text>
                  <Text style={styles.sessionMeta}>
                    Última actividad: {formatTime(item.lastSeenAt)}
                  </Text>
                  <Text style={styles.sessionMeta}>
                    Vence: {formatTime(item.expiresAt)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      item.current
                        ? "Cerrar esta sesión"
                        : `Cerrar sesión ${item.clientType}`
                    }
                    disabled={snapshot.busyAction !== null}
                    onPress={() => confirmRevokeSession(item)}
                    style={[
                      styles.secondaryButton,
                      snapshot.busyAction !== null && styles.disabled,
                    ]}
                  >
                    {snapshot.busyAction === `session:${item.id}` ? (
                      <ActivityIndicator accessibilityLabel="Cerrando sesión" />
                    ) : (
                      <Text style={styles.secondaryButtonText}>
                        {item.current ? "Cerrar esta sesión" : "Cerrar sesión"}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ))
            )}

            <Pressable
              accessibilityRole="button"
              disabled={snapshot.busyAction !== null}
              onPress={confirmRevokeAll}
              style={[
                styles.destructive,
                snapshot.busyAction !== null && styles.disabled,
              ]}
            >
              {snapshot.busyAction === "all-sessions" ? (
                <ActivityIndicator accessibilityLabel="Cerrando todas las sesiones" />
              ) : (
                <Text style={styles.destructiveText}>
                  Cerrar todas las sesiones
                </Text>
              )}
            </Pressable>
          </View>
        </>
      ) : null}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  centered: {
    minHeight: 120,
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: "#2f2f36",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d6d6df",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: "#ffffff",
  },
  passwordVisibility: {
    minHeight: 40,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  passwordVisibilityText: {
    color: "#34345a",
    fontWeight: "700",
  },
  primary: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#24243a",
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
  success: {
    fontSize: 14,
    lineHeight: 20,
    color: "#245c35",
  },
  notice: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f1f3f8",
    fontSize: 14,
    lineHeight: 20,
    color: "#34343e",
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
    color: "#666671",
  },
  sessionCard: {
    gap: 6,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#ececf2",
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#20202a",
  },
  sessionMeta: {
    fontSize: 14,
    lineHeight: 20,
    color: "#5b5b66",
  },
  secondaryButton: {
    minHeight: 44,
    marginTop: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9cad4",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  secondaryButtonText: {
    color: "#292933",
    fontWeight: "700",
  },
  destructive: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#9f1d1d",
  },
  destructiveText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.55,
  },
});
