import { useState } from "react";
import { Redirect } from "expo-router";
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

import { useSession } from "@/features/session/session-provider";

export default function SignInRoute() {
  const { snapshot, login, retryRestore } = useSession();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  if (snapshot.kind === "authenticated") {
    return <Redirect href="/home" />;
  }

  const submit = async () => {
    setFormError(null);
    try {
      await login(email, password);
    } catch {
      setFormError("No pudimos iniciar sesión. Revisá tus datos e intentá de nuevo.");
    }
  };

  const transportState =
    snapshot.kind === "offline"
      ? "Sin conexión. Tu sesión local no se tomó como autoridad."
      : snapshot.kind === "timeout"
        ? "El servidor tardó demasiado en responder."
        : snapshot.kind === "server_unavailable"
          ? "Los Apuntes no está disponible en este momento."
          : snapshot.kind === "restricted"
            ? "Tu cuenta tiene el acceso restringido."
            : snapshot.kind === "error"
              ? "Ocurrió un error inesperado."
              : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: Math.max(insets.top, 24) }]}
    >
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Los Apuntes
        </Text>
        <Text style={styles.subtitle}>Entrá con tu cuenta universitaria.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />

        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          accessibilityLabel="Contraseña"
          autoCapitalize="none"
          autoComplete="current-password"
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />

        {formError || transportState ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {formError ?? transportState}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={snapshot.kind === "restoring"}
          onPress={() => void submit()}
          style={styles.primary}
        >
          {snapshot.kind === "restoring" ? (
            <ActivityIndicator accessibilityLabel="Ingresando" />
          ) : (
            <Text style={styles.primaryText}>Ingresar</Text>
          )}
        </Pressable>

        {transportState ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void retryRestore()}
            style={styles.secondary}
          >
            <Text>Reintentar conexión</Text>
          </Pressable>
        ) : null}
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
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#17171c",
  },
  subtitle: {
    fontSize: 16,
    color: "#55555f",
    marginBottom: 8,
  },
  label: {
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
  error: {
    fontSize: 14,
    color: "#9f1d1d",
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
    fontWeight: "700",
    fontSize: 16,
  },
  secondary: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
