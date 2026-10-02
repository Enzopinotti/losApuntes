import { useEffect, useState } from "react";
import { Link, useRouter } from "expo-router";
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

import { EmailOnboardingController } from "@/features/auth/email-onboarding-controller";
import type { EmailOnboardingFailure } from "@/features/auth/email-onboarding-controller";
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
  const router = useRouter();
  const [controller] = useState(
    () => new EmailOnboardingController(mobileApiClient),
  );
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

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
        setRegisteredEmail(current.email);
        setPassword("");
        setConfirmation("");
      }
    });
  };

  const resetForm = () => {
    controller.reset();
    setRegisteredEmail(null);
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
              <TextInput
                accessibilityLabel="Contraseña"
                autoCapitalize="none"
                autoComplete="new-password"
                secureTextEntry
                textContentType="newPassword"
                value={password}
                onChangeText={setPassword}
                editable={!pending}
                style={styles.input}
              />

              <Text style={styles.label}>Repetir contraseña</Text>
              <TextInput
                accessibilityLabel="Repetir contraseña"
                autoCapitalize="none"
                autoComplete="new-password"
                secureTextEntry
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
          ) : !verificationAccepted ? (
            <Pressable
              accessibilityRole="button"
              disabled={pending}
              onPress={() => void controller.requestVerification(requestEmail)}
              style={[styles.primary, pending && styles.disabled]}
            >
              {pending && pendingAction === "request_verification" ? (
                <ActivityIndicator accessibilityLabel="Enviando correo" />
              ) : (
                <Text style={styles.primaryText}>Reenviar verificación</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/sign-in")}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>Ir a iniciar sesión</Text>
            </Pressable>
          )}

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
