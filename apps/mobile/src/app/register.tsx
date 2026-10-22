import { useEffect, useState } from "react";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  Alert,
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

import { EmailOnboardingController } from "@/features/auth/email-onboarding-controller";
import type { EmailOnboardingFailure } from "@/features/auth/email-onboarding-controller";
import { openEmailApp } from "@/features/auth/open-email-app";
import {
  authActionResendAvailableAt,
  authActionResendSecondsRemaining,
} from "@/features/auth/action-resend-cooldown";
import { PasswordVisibilityInput } from "@/features/auth/password-visibility-input";
import { mobileApiClient } from "@/features/session/session-runtime";

const failureMessage = (failure: EmailOnboardingFailure): string => {
  if (failure === "offline")
    return "Sin conexión. Revisá internet e intentá de nuevo.";
  if (failure === "timeout") return "El servidor tardó demasiado en responder.";
  if (failure === "server_unavailable")
    return "Los Apuntes no está disponible en este momento.";
  return "No pudimos completar la solicitud. Revisá los datos e intentá otra vez.";
};

export default function RegisterRoute() {
  const insets = useSafeAreaInsets();
  const [controller] = useState(
    () => new EmailOnboardingController(mobileApiClient),
  );
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resendAvailableAtMs, setResendAvailableAtMs] = useState<number | null>(
    null,
  );
  const [cooldownNowMs, setCooldownNowMs] = useState(() => Date.now());

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);

  const verificationAccepted =
    snapshot.kind === "accepted" && snapshot.action === "request_verification";
  const pending = snapshot.kind === "pending";
  const pendingAction = snapshot.kind === "pending" ? snapshot.action : null;
  const requestEmail =
    registeredEmail ??
    (snapshot.kind === "accepted"
      ? snapshot.email
      : email.trim().toLowerCase());
  const resendCooldownSeconds = authActionResendSecondsRemaining(
    resendAvailableAtMs,
    cooldownNowMs,
  );

  useEffect(() => {
    if (resendAvailableAtMs === null) return;

    const updateClock = () => setCooldownNowMs(Date.now());
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [resendAvailableAtMs]);

  const submitRegistration = () => {
    setLocalError(null);
    if (!email.trim() || !password || !confirmation) {
      setLocalError("Completá email y contraseña.");
      return;
    }
    if (password !== confirmation) {
      setLocalError("Las contraseñas no coinciden.");
      return;
    }
    void controller.register(email, password).then(() => {
      const current = controller.getSnapshot();
      if (current.kind === "accepted" && current.action === "register") {
        const acceptedAtMs = Date.now();
        setRegisteredEmail(current.email);
        setCooldownNowMs(acceptedAtMs);
        setResendAvailableAtMs(authActionResendAvailableAt(acceptedAtMs));
        setPassword("");
        setConfirmation("");
      }
    });
  };

  const requestVerification = async () => {
    if (!requestEmail || pending || resendCooldownSeconds > 0) return;

    await controller.requestVerification(requestEmail);
    const current = controller.getSnapshot();
    if (
      current.kind === "accepted" &&
      current.action === "request_verification"
    ) {
      const acceptedAtMs = Date.now();
      setCooldownNowMs(acceptedAtMs);
      setResendAvailableAtMs(authActionResendAvailableAt(acceptedAtMs));
    }
  };

  const resetForm = () => {
    controller.reset();
    setRegisteredEmail(null);
    setResendAvailableAtMs(null);
    setCooldownNowMs(Date.now());
    setPassword("");
    setConfirmation("");
    setLocalError(null);
  };

  const showSuccess = registeredEmail !== null;
  const errorMessage =
    localError ??
    (snapshot.kind === "failed" ? failureMessage(snapshot.failure) : null);

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
            Crear cuenta
          </Text>
          <Text style={styles.subtitle}>
            Usá tu email para empezar en Los Apuntes.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setLocalError(null);
              if (showSuccess) resetForm();
            }}
            editable={!pending}
            style={styles.input}
          />

          {!showSuccess ? (
            <>
              <Text style={styles.label}>Contraseña</Text>
              <PasswordVisibilityInput
                fieldLabel="Contraseña"
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                value={password}
                onChangeText={setPassword}
                editable={!pending}
                style={styles.input}
              />

              <Text style={styles.label}>Repetir contraseña</Text>
              <PasswordVisibilityInput
                fieldLabel="Repetir contraseña"
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                value={confirmation}
                onChangeText={setConfirmation}
                editable={!pending}
                style={styles.input}
              />
            </>
          ) : null}

          {errorMessage ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorMessage}
            </Text>
          ) : null}

          {registeredEmail && !verificationAccepted ? (
            <Text accessibilityLiveRegion="polite" style={styles.status}>
              Si tu registro fue aceptado, revisá tu correo para verificar la
              cuenta.
            </Text>
          ) : null}
          {verificationAccepted ? (
            <Text accessibilityLiveRegion="polite" style={styles.status}>
              Si hay una cuenta pendiente para {requestEmail}, enviamos un
              enlace de verificación.
            </Text>
          ) : null}

          {!showSuccess ? (
            <Pressable
              accessibilityRole="button"
              disabled={pending}
              onPress={submitRegistration}
              style={[styles.primary, pending && styles.disabled]}
            >
              {pending && pendingAction === "register" ? (
                <ActivityIndicator accessibilityLabel="Creando cuenta" />
              ) : (
                <Text style={styles.primaryText}>Crear cuenta</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={pending || resendCooldownSeconds > 0}
              onPress={() => void requestVerification()}
              style={[
                styles.primary,
                (pending || resendCooldownSeconds > 0) && styles.disabled,
              ]}
            >
              {pending && pendingAction === "request_verification" ? (
                <ActivityIndicator accessibilityLabel="Enviando correo" />
              ) : (
                <Text style={styles.primaryText}>
                  {resendCooldownSeconds > 0
                    ? `Solicitar otro enlace en ${resendCooldownSeconds} s`
                    : "Reenviar verificación"}
                </Text>
              )}
            </Pressable>
          )}

          {showSuccess && Platform.OS === "android" ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void openEmailApp().then((opened) => {
                  if (!opened) {
                    Alert.alert(
                      "No pudimos abrir una app de correo",
                      "Abrí tu correo desde la app que uses y volvé acá para reenviar el enlace.",
                    );
                  }
                });
              }}
              style={styles.secondary}
            >
              <Text>Abrir app de correo</Text>
            </Pressable>
          ) : null}

          {showSuccess ? (
            <Pressable
              accessibilityRole="button"
              disabled={pending}
              onPress={resetForm}
              style={styles.secondary}
            >
              <Text>Cambiar email</Text>
            </Pressable>
          ) : null}

          <Link href="/sign-in" asChild>
            <Pressable accessibilityRole="link" style={styles.secondary}>
              <Text>Ya tengo cuenta</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f7fb",
  },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20 },
  card: {
    gap: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#ffffff",
  },
  title: { fontSize: 30, fontWeight: "800", color: "#17171c" },
  subtitle: { fontSize: 16, color: "#55555f", marginBottom: 8 },
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
  error: { fontSize: 14, color: "#9f1d1d" },
  status: { fontSize: 14, color: "#2f2f36" },
  primary: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#24243a",
  },
  disabled: { opacity: 0.6 },
  primaryText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
  secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
