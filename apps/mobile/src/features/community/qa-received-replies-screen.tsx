import { Redirect, useIsFocused, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";
import { mobileQaReceivedRepliesApi } from "./qa-received-replies-runtime";
import {
  QaReceivedRepliesController,
  type QaReceivedRepliesFailure,
  type QaReceivedRepliesSnapshot,
} from "./qa-received-replies-controller";

function formatAnsweredAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function RetryCard({
  failure,
  onRetry,
}: {
  failure: QaReceivedRepliesFailure;
  onRetry: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="alert" style={styles.error}>
        {failure.message}
      </Text>
      {failure.retryable || failure.restartable ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonLabel}>
            {failure.restartable ? "Volver al inicio" : "Reintentar"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function QaReceivedRepliesScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const { snapshot: session, retryRestore } = useSession();
  const [appState, setAppState] = useState(AppState.currentState ?? "active");
  const controller = useMemo(
    () => new QaReceivedRepliesController(mobileQaReceivedRepliesApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<QaReceivedRepliesSnapshot>(
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
  const visible = focused && appState === "active";

  useEffect(() => {
    if (!authorityKey || !visible) {
      controller.invalidate();
      return;
    }
    void controller.load(authorityKey);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, controller, visible]);

  useEffect(() => () => controller.invalidate(), [controller]);

  if (session.kind === "restoring") {
    return (
      <ProductSurface
        title="Respuestas recibidas"
        description="Validando tu sesión para abrir la bandeja privada."
      >
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
        ? "La cuenta no puede acceder a estas respuestas."
        : session.kind === "offline"
          ? "No hay conexión para validar tu sesión."
          : session.kind === "timeout"
            ? "La validación de tu sesión tardó demasiado."
            : session.kind === "server_unavailable"
              ? "El servicio de sesión no está disponible ahora."
              : "No pudimos validar tu sesión.";
    return (
      <ProductSurface
        title="Respuestas recibidas"
        description="La bandeja requiere una sesión validada."
      >
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {message}
          </Text>
          {session.kind !== "restricted" ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void retryRestore()}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.buttonLabel}>Reintentar sesión</Text>
            </Pressable>
          ) : null}
        </View>
      </ProductSurface>
    );
  }

  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;
  const loading = !current || current.kind === "loading";
  const ready = current?.kind === "ready" ? current : null;
  const retry = () => {
    if (authorityKey && visible) void controller.load(authorityKey);
  };
  const loadMore = () => {
    if (authorityKey && visible) void controller.loadMore(authorityKey);
  };

  return (
    <ProductSurface
      title="Respuestas recibidas"
      description="Respuestas visibles a tus preguntas. El detalle vuelve a validar el acceso antes de abrirse."
      onRefresh={retry}
      refreshing={current?.kind === "loading"}
    >
      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator accessibilityLabel="Cargando respuestas" />
          <Text style={styles.copy}>Cargando tus respuestas recibidas…</Text>
        </View>
      ) : current?.kind === "error" ? (
        <RetryCard failure={current.failure} onRetry={retry} />
      ) : ready?.page.items.length === 0 ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            Todavía no hay respuestas visibles
          </Text>
          <Text style={styles.copy}>
            Cuando una respuesta disponible llegue a una de tus preguntas,
            aparecerá acá.
          </Text>
        </View>
      ) : ready ? (
        <View style={styles.list}>
          {ready.page.items.map((item) => (
            <Pressable
              key={item.answerId}
              accessibilityRole="button"
              accessibilityLabel={`Abrir pregunta: ${item.questionTitle}. Respondida ${formatAnsweredAt(item.answeredAt)}${item.isAccepted ? ". Tiene una respuesta aceptada" : ""}`}
              onPress={() =>
                router.push({
                  pathname: "/questions/[questionId]",
                  params: { questionId: item.questionId },
                })
              }
              style={({ pressed }) => [
                styles.replyCard,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.questionTitle}>{item.questionTitle}</Text>
              <Text style={styles.meta}>
                Respondida {formatAnsweredAt(item.answeredAt)}
              </Text>
              {item.isAccepted ? (
                <Text style={styles.accepted}>Respuesta aceptada</Text>
              ) : null}
            </Pressable>
          ))}
          {ready.failure ? (
            <RetryCard
              failure={ready.failure}
              onRetry={ready.failure.restartable ? retry : loadMore}
            />
          ) : null}
          {ready.page.nextCursor && !ready.failure ? (
            <Pressable
              accessibilityRole="button"
              onPress={loadMore}
              disabled={ready.loadingMore}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
                ready.loadingMore && styles.disabled,
              ]}
            >
              <Text style={styles.buttonLabel}>
                {ready.loadingMore ? "Cargando…" : "Cargar más respuestas"}
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
    gap: 12,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: {
    fontSize: 14,
    lineHeight: 21,
    color: "#5b5b66",
  },
  error: {
    fontSize: 14,
    lineHeight: 21,
    color: "#9f1d1d",
  },
  list: { gap: 12 },
  replyCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: "#e0e0e8",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#ffffff",
  },
  questionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#20202a",
  },
  meta: {
    fontSize: 13,
    lineHeight: 19,
    color: "#5b5b66",
  },
  accepted: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "#e7f4ec",
    color: "#176b43",
    fontSize: 12,
    fontWeight: "700",
  },
  button: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  buttonLabel: {
    color: "#24243a",
    fontSize: 15,
    fontWeight: "700",
  },
  pressed: { backgroundColor: "#f0eff8" },
  disabled: { opacity: 0.5 },
});
