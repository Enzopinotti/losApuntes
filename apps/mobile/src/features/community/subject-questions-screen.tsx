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

import {
  MobileCommunityFeedController,
  type CommunityFailure,
  type CommunityQuestionFeedSnapshot,
} from "./community-controller";
import { mobileCommunityApi } from "./community-runtime";
import { canComposeForSubject } from "./subject-questions-policy";
import {
  useCommunityAuthority,
  type CommunityAuthorityGate,
} from "./use-community-authority";

function feedError(failure: CommunityFailure): string {
  switch (failure.kind) {
    case "offline":
      return "No hay conexión para consultar las preguntas.";
    case "timeout":
      return "La consulta de preguntas tardó demasiado.";
    case "server_unavailable":
      return "El servicio de preguntas no está disponible.";
    case "auth_required":
      return "La sesión venció. Iniciá sesión nuevamente.";
    case "restricted":
      return "No tenés acceso a estas preguntas.";
    case "error":
      return "No pudimos cargar las preguntas de esta materia.";
  }
}

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

/**
 * Navigable feed scoped to a subject selected in Search.
 * Read access comes exclusively from CommunityApi.questions; the route
 * subjectId never creates subject participation or posting permission.
 */
export function SubjectQuestionsScreen({
  subjectId,
}: {
  subjectId: string | null;
}) {
  const router = useRouter();
  const authority = useCommunityAuthority();
  const controller = useMemo(
    () => new MobileCommunityFeedController(mobileCommunityApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<CommunityQuestionFeedSnapshot>(
    controller.getSnapshot(),
  );
  const contextReady =
    authority.gate === "ready" && authority.scope.kind !== "unresolved";
  const scopeKey =
    subjectId && contextReady && authority.authorityKey
      ? `${authority.authorityKey}:questions-subject:${subjectId}`
      : null;

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    if (!scopeKey || !subjectId) {
      controller.invalidate();
      return;
    }
    void controller.load(scopeKey, { subjectId, limit: 25 });
    return () => controller.invalidate(scopeKey);
  }, [controller, scopeKey, subjectId]);

  const retry = useCallback(() => {
    if (!scopeKey || !subjectId) {
      void authority.retry();
      return;
    }
    void controller.load(scopeKey, { subjectId, limit: 25 });
  }, [authority.retry, controller, scopeKey, subjectId]);

  const loadMore = () => {
    if (scopeKey) void controller.loadMore(scopeKey);
  };

  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === scopeKey
      ? snapshot
      : null;
  const canCompose = canComposeForSubject(
    subjectId,
    authority.gate,
    authority.scope,
  );

  return (
    <ProductSurface
      title="Preguntas de la materia"
      description="Explorá dudas y respuestas de esta materia, sin salir de tu recorrido de estudio."
      onRefresh={subjectId ? retry : undefined}
      refreshing={current?.kind === "loading"}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver a la pantalla anterior"
        style={styles.back}
        onPress={() => router.back()}
      >
        <Text style={styles.link}>Volver</Text>
      </Pressable>

      {!subjectId ? (
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
              onPress={() => void authority.retry()}
              style={styles.action}
            >
              <Text style={styles.link}>Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>
              Preguntas relacionadas
            </Text>
            <Text style={styles.note}>
              El servidor filtra por materia y aplica las reglas de visibilidad.
              Podés leer preguntas aunque no sea tu materia académica actual.
            </Text>
            {subjectId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver preguntas de esta materia que necesitan ayuda"
                onPress={() =>
                  router.push({
                    pathname: "/questions/subjects/[subjectId]/needs-help",
                    params: { subjectId },
                  })
                }
                style={styles.action}
              >
                <Text style={styles.link}>
                  Ver preguntas que necesitan ayuda
                </Text>
              </Pressable>
            ) : null}
            {canCompose ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hacer una pregunta en mi materia actual"
                onPress={() => router.push("/questions/new")}
                style={styles.action}
              >
                <Text style={styles.link}>Hacer una pregunta</Text>
              </Pressable>
            ) : (
              <Text style={styles.note}>
                Para publicar una pregunta, primero seleccioná esta materia como
                contexto académico actual desde Inicio.
              </Text>
            )}
          </View>

          {!current || current.kind === "loading" ? (
            <View style={styles.card}>
              <ActivityIndicator accessibilityLabel="Cargando preguntas de la materia" />
              <Text style={styles.note}>Buscando preguntas disponibles…</Text>
            </View>
          ) : current.kind === "failure" ? (
            <View style={styles.card}>
              <Text accessibilityRole="alert" style={styles.error}>
                {feedError(current.failure)}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={retry}
                style={styles.action}
              >
                <Text style={styles.link}>Reintentar preguntas</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              {current.page.items.length === 0 ? (
                <Text style={styles.note}>
                  Todavía no hay preguntas disponibles en esta materia.
                </Text>
              ) : (
                current.page.items.map((question) => (
                  <Pressable
                    key={question.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir pregunta: ${question.title}. ${question.answerCount} respuestas`}
                    onPress={() =>
                      router.push({
                        pathname: "/questions/[questionId]",
                        params: { questionId: question.id },
                      })
                    }
                    style={styles.question}
                  >
                    <Text style={styles.questionTitle}>{question.title}</Text>
                    <Text style={styles.note}>
                      {question.academic.subject.name} · {question.answerCount}{" "}
                      respuestas
                    </Text>
                    <Text style={styles.link}>Leer respuestas</Text>
                  </Pressable>
                ))
              )}
              {current.loadMoreFailure ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {feedError(current.loadMoreFailure)}
                </Text>
              ) : null}
              {current.page.nextCursor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cargar más preguntas de esta materia"
                  accessibilityState={{ disabled: current.loadingMore }}
                  disabled={current.loadingMore}
                  onPress={loadMore}
                  style={styles.action}
                >
                  <Text style={styles.link}>
                    {current.loadingMore ? "Cargando…" : "Cargar más preguntas"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </>
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
