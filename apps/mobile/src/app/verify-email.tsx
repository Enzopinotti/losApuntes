import { useEffect, useState } from "react";
import { Link, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mobileAuthActionTokenVault } from "@/features/auth/action-token-runtime";
import { completeEmailVerification } from "@/features/auth/email-verification";
import type { EmailVerificationResult } from "@/features/auth/email-verification";
import { mobileApiClient } from "@/features/session/session-runtime";

const statusCopy: Record<
  Exclude<EmailVerificationResult, "cancelled">,
  string
> = {
  completed: "Tu correo quedó verificado. Ya podés iniciar sesión.",
  invalid_link: "El enlace no es válido, ya se usó o venció.",
  offline: "No hay conexión. Volvé a abrir el enlace cuando tengas internet.",
  timeout:
    "El servidor tardó demasiado. Volvé a abrir el enlace para intentar otra vez.",
  server_unavailable:
    "Los Apuntes no está disponible. Volvé a abrir el enlace más tarde.",
  failed:
    "No pudimos verificar el correo. Pedí un nuevo enlace e intentá otra vez.",
};

export default function VerifyEmailRoute() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ handle?: string | string[] }>();
  const handle = typeof params.handle === "string" ? params.handle : null;
  const [result, setResult] = useState<EmailVerificationResult>("cancelled");
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    if (!handle) {
      setResult("invalid_link");
      setFinished(true);
      return () => controller.abort();
    }

    setFinished(false);
    void completeEmailVerification(
      mobileApiClient,
      mobileAuthActionTokenVault,
      handle,
      controller.signal,
    ).then((nextResult) => {
      if (!active || nextResult === "cancelled") return;
      setResult(nextResult);
      setFinished(true);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [handle]);

  const message = finished
    ? statusCopy[result === "cancelled" ? "invalid_link" : result]
    : "Confirmando tu correo…";
  const isVerified = finished && result === "completed";

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 24) }]}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Verificación de email
        </Text>
        <Text
          accessibilityRole={finished ? "alert" : undefined}
          accessibilityLiveRegion="polite"
          style={styles.body}
        >
          {message}
        </Text>

        {isVerified ? (
          <Link href="/sign-in" asChild>
            <Pressable accessibilityRole="button" style={styles.primary}>
              <Text style={styles.primaryText}>Iniciar sesión</Text>
            </Pressable>
          </Link>
        ) : (
          <Link href="/register" asChild>
            <Pressable accessibilityRole="button" style={styles.primary}>
              <Text style={styles.primaryText}>Volver al registro</Text>
            </Pressable>
          </Link>
        )}
      </View>
    </View>
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
    gap: 16,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#ffffff",
  },
  title: { fontSize: 26, fontWeight: "800", color: "#17171c" },
  body: { fontSize: 16, lineHeight: 23, color: "#2f2f36" },
  primary: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#24243a",
  },
  primaryText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },
});
