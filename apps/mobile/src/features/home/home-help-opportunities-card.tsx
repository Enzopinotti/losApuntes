import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { mobileHomeHelpOpportunitiesApi } from "./home-help-opportunities-runtime";
import {
  HomeHelpOpportunitiesController,
  type HomeHelpOpportunitiesSnapshot,
} from "./home-help-opportunities-controller";

function unansweredLabel(count: number): string {
  return count === 1
    ? "1 pregunta sin respuestas visibles"
    : count + " preguntas sin respuestas visibles";
}

export function HomeHelpOpportunitiesCard({
  authorityKey,
}: {
  authorityKey: string | null;
}) {
  const router = useRouter();
  const controller = useMemo(
    () => new HomeHelpOpportunitiesController(mobileHomeHelpOpportunitiesApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<HomeHelpOpportunitiesSnapshot>(
    controller.getSnapshot(),
  );

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    if (!authorityKey) {
      controller.invalidate();
      return;
    }
    void controller.load(authorityKey);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, controller]);

  useEffect(() => () => controller.invalidate(), [controller]);

  const retry = useCallback(() => {
    if (authorityKey) void controller.load(authorityKey);
  }, [authorityKey, controller]);
  const openSubject = useCallback(
    (subjectId: string) =>
      router.push({
        pathname: "/questions/subjects/[subjectId]/needs-help",
        params: { subjectId },
      }),
    [router],
  );

  if (!authorityKey) return null;

  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;
  const positiveItems =
    current?.kind === "ready"
      ? current.data.items.filter((item) => item.unansweredPeerQuestions > 0)
      : [];
  const hasMoreSubjects =
    current?.kind === "ready" && current.data.hasMoreSubjects;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Dónde podés ayudar</Text>
      <Text style={styles.copy}>
        Preguntas abiertas de tus materias que todavía no tienen respuestas
        visibles.
      </Text>

      {!current || current.kind === "loading" ? (
        <View style={styles.inline}>
          <ActivityIndicator accessibilityLabel="Buscando preguntas sin respuesta" />
          <Text style={styles.copy}>Consultando tus materias…</Text>
        </View>
      ) : current.kind === "error" ? (
        <View style={styles.messageGroup}>
          <Text accessibilityRole="alert" style={styles.copy}>
            No pudimos consultar dónde hace falta una respuesta.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar búsqueda de preguntas sin respuesta"
            onPress={retry}
            style={styles.retry}
          >
            <Text style={styles.action}>Reintentar</Text>
          </Pressable>
        </View>
      ) : positiveItems.length === 0 ? (
        <Text style={styles.copy}>
          {hasMoreSubjects
            ? "No encontramos preguntas en las 12 materias más recientes. Hay otras materias actuales fuera de este resumen."
            : "Por ahora no hay preguntas de tus materias actuales sin respuestas visibles."}
        </Text>
      ) : (
        <View style={styles.opportunities}>
          {positiveItems.slice(0, 3).map((item) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                item.subjectName +
                ", " +
                unansweredLabel(item.unansweredPeerQuestions)
              }
              accessibilityHint="Abre las preguntas que necesitan ayuda en esta materia."
              key={item.subjectId}
              onPress={() => openSubject(item.subjectId)}
              style={({ pressed }) => [
                styles.opportunity,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.subjectName}>{item.subjectName}</Text>
              <Text style={styles.count}>
                {unansweredLabel(item.unansweredPeerQuestions)}
              </Text>
            </Pressable>
          ))}
          {hasMoreSubjects ? (
            <Text style={styles.note}>
              Este resumen contempla hasta 12 materias actuales.
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderWidth: 1,
    borderColor: "#e4e1eb",
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#ffffff",
  },
  title: {
    color: "#20202a",
    fontSize: 17,
    fontWeight: "700",
  },
  copy: {
    color: "#5b5b66",
    fontSize: 14,
    lineHeight: 20,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  opportunities: {
    gap: 8,
  },
  opportunity: {
    minHeight: 58,
    gap: 4,
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f8f6fc",
  },
  pressed: {
    backgroundColor: "#ebe6f4",
  },
  subjectName: {
    color: "#342b4d",
    fontSize: 14,
    fontWeight: "700",
  },
  count: {
    color: "#5b5b66",
    fontSize: 13,
    lineHeight: 18,
  },
  note: {
    color: "#696873",
    fontSize: 12,
    lineHeight: 18,
  },
  messageGroup: {
    gap: 8,
  },
  retry: {
    minHeight: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  action: {
    color: "#43376a",
    fontSize: 14,
    fontWeight: "700",
  },
});
