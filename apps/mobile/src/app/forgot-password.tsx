import { useEffect, useRef, useState } from "react";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { requestPasswordRecovery } from "@/features/auth/password-recovery";
import { mobileApiClient } from "@/features/session/session-runtime";

type RequestState =
  | "idle"
  | "pending"
  | "accepted"
  | "offline"
  | "timeout"
  | "server_unavailable"
  | "rejected";

const failureCopy: Record<
  Exclude<RequestState, "idle" | "pending" | "accepted">,
  string
> = {
  offline: "Sin conexión. Revisá internet e intentá de nuevo.",
  timeout: "El servidor tardó demasiado en responder.",
  server_unavailable: "Los Apuntes no está disponible en este momento.",
  rejected: "No pudimos iniciar la recuperación. Intentá de nuevo.",
};

export default function ForgotPasswordRoute() {
  const insets = useSafeAreaInsets();
  const requestGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<RequestState>("idle");

  const pending = state === "pending";
  const normalizedEmail = email.trim().toLowerCase();

  useEffect(
    () => () => {
      requestGeneration.current += 1;
      activeRequest.current?.abort();
      activeRequest.current = null;
    },
    [],
  );

  const submit = async () => {
    if (!normalizedEmail || pending) return;

    requestGeneration.current += 1;
    const generation = requestGeneration.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setState("pending");

    const result = await requestPasswordRecovery(
      mobileApiClient,
      normalizedEmail,
      controller.signal,
    );

    if (generation !== requestGeneration.current) return;
    activeRequest.current = null;
    setState(result);
  };

  const accepted = state === "accepted";
  const error =
    state === "offline" ||
    state === "timeout" ||
    state === "server_unavailable" ||
    state === "rejected"
      ? failureCopy[state]
      : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: Math.max(insets.top, 24) }]}
    >
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Recuperar contraseña
        </Text>
        <Text style={styles.subtitle}>
          Ingresá el email de tu cuenta. Si puede recuperarse, te enviaremos un
          enlace de un solo uso.
        </Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          editable={!pending}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={(value) => {
            requestGeneration.current += 1;
            setEmail(value);
            setState("idle");
          }}
          style={styles.input}
        />

        {accepted ? (
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            Si existe una cuenta que puede recuperarse, enviamos las
            instrucciones al correo indicado.
          </Text>
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!normalizedEmail || pending}
          onPress={() => void submit()}
          style={[
            styles.primary,
            (!normalizedEmail || pending) && styles.disabled,
          ]}
        >
          {pending ? (
            <ActivityIndicator accessibilityLabel="Enviando recuperación" />
          ) : (
            <Text style={styles.primaryText}>
              {accepted ? "Enviar de nuevo" : "Enviar enlace"}
            </Text>
          )}
        </Pressable>

        <Link href="/sign-in" asChild>
          <Pressable accessibilityRole="link" style={styles.secondary}>
            <Text>Volver a iniciar sesión</Text>
          </Pressable>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "#f7f7fb",
  },
  card: {
    gap: 12,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#ffffff",
  },
  title: { fontSize: 28, fontWeight: "800", color: "#17171c" },
  subtitle: { fontSize: 16, lineHeight: 23, color: "#55555f" },
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
