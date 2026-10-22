import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ProductSurface } from "@/features/navigation/product-surface";

import { mobileQaNeedsHelpApi } from "./qa-needs-help-runtime";
import {
  QaNeedsHelpController,
  type QaNeedsHelpSnapshot,
} from "./qa-needs-help-controller";
import { subjectQuestionsRouteId } from "./subject-questions-policy";
import {
  useCommunityAuthority,
  type CommunityAuthorityGate,
} from "./use-community-authority";

function gateCopy(gate: CommunityAuthorityGate): string {
  if (gate === "restricted") return "La cuenta tiene restringido el acceso.";
  if (gate === "auth_required")
    return "Iniciá sesión para consultar preguntas.";
  if (gate === "offline") return "Sin conexión para revalidar el contexto.";
  if (gate === "timeout") return "Se agotó el tiempo al revalidar la sesión.";
  if (gate === "server_unavailable") return "El servidor no está disponible.";
  if (gate === "authority_mismatch")
    return "Revalidando el contexto académico.";
  if (gate === "error") return "No pudimos revalidar el contexto académico.";
  return "Preparando preguntas con tu sesión y contexto académico…";
}

function formatQuestionDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(date);
}

export function QaNeedsHelpScreen({ subjectId }: { subjectId: string | null }) {
  const router = useRouter();
  const authority = useCommunityAuthority();
  const controller = useMemo(
    () => new QaNeedsHelpController(mobileQaNeedsHelpApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<QaNeedsHelpSnapshot>(
    controller.getSnapshot(),
  );
  const validSubjectId =
    subjectId && subjectQuestionsRouteId(subjectId) === subjectId
      ? subjectId
      : null;
  const contextReady =
    authority.gate === "ready" && authority.scope.kind !== "unresolved";
  const authorityKey =
    validSubjectId && contextReady && authority.authorityKey
      ? `${authority.authorityKey}:needs-help:${validSubjectId}`
      : null;

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    if (!authorityKey || !validSubjectId) {
      controller.invalidate();
      return;
    }
    void controller.load(authorityKey, validSubjectId);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, controller, validSubjectId]);

  useEffect(() => () => controller.invalidate(), [controller]);

  const retry = useCallback(() => {
    if (!authorityKey || !validSubjectId) {
      void authority.retry();
      return;
    }
    void controller.load(authorityKey, validSubjectId);
  }, [authority.retry, authorityKey, controller, validSubjectId]);

  const loadMore = useCallback(() => {
    if (authorityKey && validSubjectId) {
      void controller.loadMore(authorityKey, validSubjectId);
    }
  }, [authorityKey, controller, validSubjectId]);

  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;

  return (
    <ProductSurface
      title="Preguntas que necesitan ayuda"
      description="Preguntas abiertas sin respuestas visibles, ordenadas desde las que llevan más tiempo esperando. La antigüedad no indica urgencia."
      onRefresh={validSubjectId ? retry : undefined}
      refreshing={current?.kind === "loading"}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver a preguntas de la materia"
        style={styles.back}
        onPress={() => router.back()}
      >
        <Text style={styles.link}>Volver a preguntas de la materia</Text>
      </Pressable>

      {!validSubjectId ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            El enlace de la materia no es válido.
          </Text>
        </View>
      ) : !contextReady ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.note}>
            {authority.scope.kind === "unresolved"
              ? "El contexto académico está desactualizado. Revalidalo antes de continuar."
              : gateCopy(authority.gate)}
          </Text>
          {authority.gate !== "blurred" && authority.gate !== "suspended" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Revalidar contexto académico"
              onPress={retry}
              style={styles.action}
            >
              <Text style={styles.link}>Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : !current || current.kind === "loading" ? (
        <View style={styles.card}>
          <ActivityIndicator accessibilityLabel="Buscando preguntas" />
          <Text style={styles.note}>
            Buscando preguntas sin respuestas visibles…
          </Text>
        </View>
      ) : current.kind === "error" ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {current.failure.message}
          </Text>
          {current.failure.retryable || current.failure.restartable ? (
            <Pressable
              accessibilityRole="button"
              onPress={retry}
              style={styles.action}
            >
              <Text style={styles.link}>
                {current.failure.restartable
                  ? "Volver al inicio"
                  : "Reintentar"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : current.page.items.length === 0 ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>
            No hay preguntas en este carril
          </Text>
          <Text style={styles.note}>
            Las preguntas visibles de esta materia ya tienen al menos una
            respuesta disponible, o todavía no hay preguntas abiertas.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          {current.page.items.map((question) => (
            <Pressable
              key={question.questionId}
              accessibilityRole="button"
              accessibilityLabel={`Abrir pregunta: ${question.title}. Publicada ${formatQuestionDate(question.createdAt)}`}
              onPress={() =>
                router.push({
                  pathname: "/questions/[questionId]",
                  params: { questionId: question.questionId },
                })
              }
              style={({ pressed }) => [
                styles.question,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.questionTitle}>{question.title}</Text>
              <Text style={styles.note}>
                Publicada {formatQuestionDate(question.createdAt)}
              </Text>
              <Text style={styles.link}>Abrir pregunta</Text>
            </Pressable>
          ))}
          {current.loadMoreFailure ? (
            <View>
              <Text accessibilityRole="alert" style={styles.error}>
                {current.loadMoreFailure.message}
              </Text>
              {current.loadMoreFailure.retryable ||
              current.loadMoreFailure.restartable ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={
                    current.loadMoreFailure.restartable ? retry : loadMore
                  }
                  style={styles.action}
                >
                  <Text style={styles.link}>
                    {current.loadMoreFailure.restartable
                      ? "Volver al inicio"
                      : "Reintentar esta página"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {current.page.nextCursor && !current.loadMoreFailure ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: current.loadingMore }}
              disabled={current.loadingMore}
              onPress={loadMore}
              style={[styles.action, current.loadingMore && styles.disabled]}
            >
              <Text style={styles.link}>
                {current.loadingMore ? "Cargando…" : "Cargar más preguntas"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  card: {
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12,
    borderRadius: 18,
  },
  heading: { color: "#20202a", fontSize: 18, fontWeight: "700" },
  question: {
    paddingVertical: 14,
    gap: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#dddce6",
  },
  questionTitle: { color: "#20202a", fontSize: 16, fontWeight: "700" },
  note: { color: "#686875", fontSize: 14, lineHeight: 20 },
  error: { color: "#9f1d1d", fontSize: 14, lineHeight: 20 },
  link: { color: "#43366a", fontSize: 14, fontWeight: "700" },
  pressed: { backgroundColor: "#f0eff8" },
  disabled: { opacity: 0.5 },
  action: {
    alignSelf: "flex-start",
    minHeight: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
