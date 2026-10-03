import { useEffect, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mobileAuthActionTokenVault } from "@/features/auth/action-token-runtime";
import {
  newPasswordValidationMessage,
  PasswordRecoveryController,
  type PasswordRecoveryFailure,
} from "@/features/auth/password-recovery";
import { mobileApiClient } from "@/features/session/session-runtime";

const failureCopy: Record<PasswordRecoveryFailure, string> = {
  invalid_link: "Este enlace ya no está disponible. Pedí uno nuevo.",
  offline: "Sin conexión. Revisá internet e intentá de nuevo.",
  timeout: "El servidor tardó demasiado en responder.",
  server_unavailable: "Los Apuntes no está disponible en este momento.",
  rejected: "No pudimos completar la recuperación. Intentá de nuevo.",
};

export default function ResetPasswordRoute() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ handle?: string | string[] }>();
  const handle = typeof params.handle === "string" ? params.handle : "";
  const [controller] = useState(
    () =>
      new PasswordRecoveryController(
        mobileApiClient,
        mobileAuthActionTokenVault,
      ),
  );
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    void controller.inspect(handle);

    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, [controller, handle]);

  const showForm =
    snapshot.kind === "ready" || snapshot.kind === "submitting";
  const pending =
    snapshot.kind === "checking" || snapshot.kind === "submitting";
  const terminalFailure =
    snapshot.kind === "failed" ? snapshot.failure : null;
  const retryableInspectFailure =
    terminalFailure === "offline" ||
    terminalFailure === "timeout" ||
    terminalFailure === "server_unavailable" ||
    terminalFailure === "rejected";
  const remoteError =
    snapshot.kind === "ready" && snapshot.failure
      ? failureCopy[snapshot.failure]
      : null;

  const submit = () => {
    setLocalError(null);

    const validation = newPasswordValidationMessage(newPassword);
    if (validation !== true) {
      setLocalError(validation);
      return;
    }

    if (newPassword !== confirmation) {
      setLocalError("Las contraseñas no coinciden.");
      return;
    }

    void controller.complete(newPassword);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            Elegí una nueva contraseña
          </Text>

          {snapshot.kind === "checking" ? (
            <View accessibilityLiveRegion="polite" style={styles.statusRow}>
              <ActivityIndicator accessibilityLabel="Validando enlace" />
              <Text style={styles.status}>Validando enlace…</Text>
            </View>
          ) : null}

          {showForm ? (
            <>
              <Text style={styles.label}>Nueva contraseña</Text>
              <TextInput
                accessibilityLabel="Nueva contraseña"
                autoCapitalize="none"
                autoComplete="new-password"
                editable={!pending}
                secureTextEntry
                textContentType="newPassword"
                value={newPassword}
                onChangeText={(value) => {
                  setNewPassword(value);
                  setLocalError(null);
                }}
                style={styles.input}
              />

              <Text style={styles.label}>Repetir contraseña</Text>
              <TextInput
                accessibilityLabel="Repetir contraseña"
                autoCapitalize="none"
                autoComplete="new-password"
                editable={!pending}
                secureTextEntry
                textContentType="newPassword"
                value={confirmation}
                onChangeText={(value) => {
                  setConfirmation(value);
                  setLocalError(null);
                }}
                style={styles.input}
              />

              {localError || remoteError ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {localError ?? remoteError}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={pending}
                onPress={submit}
                style={[styles.primary, pending && styles.disabled]}
              >
                {snapshot.kind === "submitting" ? (
                  <ActivityIndicator accessibilityLabel="Guardando contraseña" />
                ) : (
                  <Text style={styles.primaryText}>Cambiar contraseña</Text>
                )}
              </Pressable>
            </>
          ) : null}

          {snapshot.kind === "success" ? (
            <>
              <Text accessibilityLiveRegion="polite" style={styles.status}>
                Contraseña actualizada. Las sesiones anteriores quedaron
                invalidadas.
              </Text>
              <Link href="/sign-in" asChild>
                <Pressable accessibilityRole="link" style={styles.primary}>
                  <Text style={styles.primaryText}>Iniciar sesión de nuevo</Text>
                </Pressable>
              </Link>
            </>
          ) : null}

          {terminalFailure ? (
            <>
              <Text accessibilityRole="alert" style={styles.error}>
                {failureCopy[terminalFailure]}
              </Text>

              {retryableInspectFailure ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void controller.retryInspect()}
                  style={styles.primary}
                >
                  <Text style={styles.primaryText}>Reintentar</Text>
                </Pressable>
              ) : null}

              <Link href="/forgot-password" asChild>
                <Pressable accessibilityRole="link" style={styles.secondary}>
                  <Text>Pedir otro enlace</Text>
                </Pressable>
              </Link>
            </>
          ) : null}

          {snapshot.kind !== "success" ? (
            <Link href="/sign-in" asChild>
              <Pressable accessibilityRole="link" style={styles.secondary}>
                <Text>Volver a iniciar sesión</Text>
              </Pressable>
            </Link>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f7fb" },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    gap: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#ffffff",
  },
  title: { fontSize: 28, fontWeight: "800", color: "#17171c" },
  label: { fontSize: 14, fontWeight: "600", color: "#2f2f36" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d6d6df",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: "#ffffff",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  status: { fontSize: 14, lineHeight: 20, color: "#2f2f36" },
  error: { fontSize: 14, lineHeight: 20, color: "#9f1d1d" },
  primary: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#24243a",
  },
  disabled: { opacity: 0.55 },
  primaryText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
  secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
