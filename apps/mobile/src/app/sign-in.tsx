import { useEffect, useState } from "react";
import { Link, Redirect, useLocalSearchParams } from "expo-router";
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

import {
  loginWithGoogle as runGoogleLogin,
  type GoogleLoginOutcome,
} from "@/features/auth/google-mobile-flow";
import {
  isNativeGoogleConfigured,
  nativeGoogleIdentityProvider,
} from "@/features/auth/native-google-identity-provider";
import { useSession } from "@/features/session/session-provider";
import { mobileApiClient } from "@/features/session/session-runtime";

const googleOutcomeCopy: Partial<Record<GoogleLoginOutcome["kind"], string>> = {
  unavailable:
    "Google no está disponible en esta instalación. Podés ingresar con email y contraseña.",
  provider_failed: "No pudimos abrir el acceso de Google. Intentá de nuevo.",
  link_required:
    "Esa cuenta Google todavía no está vinculada. Ingresá con tu cuenta Los Apuntes y vinculala desde Seguridad.",
  network_failed:
    "No pudimos conectar con Los Apuntes. Revisá internet e intentá de nuevo.",
  authentication_failed:
    "No pudimos validar tu cuenta Google. Revisá la cuenta e intentá de nuevo.",
};

export default function SignInRoute() {
  const { snapshot, login, loginWithGoogle, retryRestore } = useSession();
  const params = useLocalSearchParams<{ notice?: string | string[] }>();
  const notice = typeof params.notice === "string" ? params.notice : null;
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<
    "checking" | "enabled" | "disabled" | "failed"
  >("checking");
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    const request = new AbortController();
    void mobileApiClient
      .googleStatus(request.signal)
      .then((status) => {
        setGoogleStatus(
          status.mobileEnabled && isNativeGoogleConfigured()
            ? "enabled"
            : "disabled",
        );
      })
      .catch(() => {
        if (!request.signal.aborted) setGoogleStatus("failed");
      });
    return () => request.abort();
  }, []);

  if (snapshot.kind === "authenticated") {
    return <Redirect href="/home" />;
  }

  const submit = async () => {
    setFormError(null);
    try {
      await login(email, password);
    } catch {
      setFormError(
        "No pudimos iniciar sesión. Revisá tus datos e intentá de nuevo.",
      );
    }
  };

  const submitGoogle = async () => {
    setFormError(null);
    setGoogleBusy(true);
    const outcome = await runGoogleLogin(
      nativeGoogleIdentityProvider,
      loginWithGoogle,
    );
    setGoogleBusy(false);
    if (outcome.kind !== "authenticated" && outcome.kind !== "cancelled") {
      setFormError(
        googleOutcomeCopy[outcome.kind] ??
          "No pudimos iniciar sesión con Google.",
      );
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
  const linkNotice =
    notice === "invalid-action-link"
      ? "El enlace de acceso no es válido o venció."
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

        {googleStatus === "enabled" ? (
          <Pressable
            accessibilityRole="button"
            disabled={snapshot.kind === "restoring" || googleBusy}
            onPress={() => void submitGoogle()}
            style={[
              styles.googleButton,
              (snapshot.kind === "restoring" || googleBusy) && styles.disabled,
            ]}
          >
            {googleBusy ? (
              <ActivityIndicator accessibilityLabel="Conectando con Google" />
            ) : (
              <Text style={styles.googleButtonText}>
                Iniciar sesión con Google
              </Text>
            )}
          </Pressable>
        ) : (
          <Text style={styles.googleNotice}>
            {googleStatus === "checking"
              ? "Comprobando acceso con Google…"
              : "El acceso con Google no está disponible en esta instalación. Usá tu email y contraseña."}
          </Text>
        )}

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

        {formError || transportState || linkNotice ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {formError ?? transportState ?? linkNotice}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={snapshot.kind === "restoring" || googleBusy}
          onPress={() => void submit()}
          style={[
            styles.primary,
            (snapshot.kind === "restoring" || googleBusy) && styles.disabled,
          ]}
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

        <Link href="/forgot-password" asChild>
          <Pressable accessibilityRole="link" style={styles.secondary}>
            <Text>Olvidé mi contraseña</Text>
          </Pressable>
        </Link>

        <Link href="/register" asChild>
          <Pressable accessibilityRole="link" style={styles.secondary}>
            <Text>Crear una cuenta</Text>
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
  googleButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9cad4",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  googleButtonText: {
    color: "#20202a",
    fontWeight: "700",
    fontSize: 16,
  },
  googleNotice: {
    fontSize: 13,
    lineHeight: 18,
    color: "#666671",
  },
  secondary: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.55,
  },
});
