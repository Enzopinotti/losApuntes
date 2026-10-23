import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { mobileResourceConsumptionApi } from "@/features/resources/resource-runtime";
import { MobileResourceShareAction } from "@/features/resources/resource-share-action";
import { savedSubjectQuestionsAction } from "@/features/resources/saved-subject-questions-action";
import { subjectResourcesSearchAction } from "@/features/search/search-subject-navigation";
import type { HomeSelectedSubject } from "./home-recent-academic-continuity";
import { mobileSessionRecentResourceOpens } from "@/features/resources/recent-opened-memory";

import {
  HomeRecentOpenedController,
  type HomeRecentOpenedSnapshot,
} from "./home-recent-opened-controller";

const failureCopy: Record<
  Extract<HomeRecentOpenedSnapshot, { kind: "failure" }>["reason"],
  string
> = {
  offline: "No hay conexión para comprobar tus últimos apuntes abiertos.",
  timeout: "El servidor tardó demasiado en comprobar estos apuntes.",
  server_unavailable: "No pudimos comprobar tus apuntes abiertos ahora.",
  forbidden: "No pudimos validar el acceso de esta sesión.",
  not_found: "Algunos apuntes dejaron de estar disponibles.",
  restricted: "La cuenta no puede acceder a estos recursos.",
  error: "No pudimos comprobar los recursos abiertos recientemente.",
};

/**
 * This is session-only navigation history. A fresh authenticated resource
 * read precedes every rendered title; nothing is persisted across launches.
 */
export function HomeRecentOpenedCard({
  authorityKey,
  sessionAuthorityKey,
  currentSubject,
}: {
  authorityKey: string | null;
  sessionAuthorityKey: string | null;
  currentSubject?: HomeSelectedSubject | null;
}) {
  const router = useRouter();
  const [recentScope, setRecentScope] = useState<"all" | "current">("all");
  const preferredSubjectId = currentSubject?.subjectId ?? null;
  useEffect(() => setRecentScope("all"), [sessionAuthorityKey]);
  const controller = useMemo(
    () =>
      new HomeRecentOpenedController(
        mobileResourceConsumptionApi,
        mobileSessionRecentResourceOpens,
      ),
    [],
  );
  const [snapshot, setSnapshot] = useState<HomeRecentOpenedSnapshot>(
    controller.getSnapshot(),
  );

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    if (!authorityKey || !sessionAuthorityKey) {
      controller.invalidate();
      return;
    }
    void controller.load(authorityKey, sessionAuthorityKey, preferredSubjectId);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, sessionAuthorityKey, preferredSubjectId, controller]);

  if (!authorityKey || !sessionAuthorityKey) return null;
  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;
  const exploreCurrentSubject = currentSubject
    ? subjectResourcesSearchAction({
        subjectId: currentSubject.subjectId,
        subjectName: currentSubject.name,
      })
    : null;
  const selectedQuestionsHref = currentSubject
    ? {
        pathname: "/questions/subjects/[subjectId]" as const,
        params: { subjectId: currentSubject.subjectId },
      }
    : null;
  const verifiedItems = current?.kind === "ready" ? current.items : [];
  const subjectItems = preferredSubjectId
    ? verifiedItems.filter(
        (resource) => resource.academic.subject.id === preferredSubjectId,
      )
    : [];
  const visibleItems =
    recentScope === "current" && preferredSubjectId
      ? subjectItems
      : verifiedItems;

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Abiertos recientemente
      </Text>
      <Text style={styles.copy}>
        Apuntes cuyo detalle abriste en esta sesión. No registra progreso ni
        lectura del archivo. Los permisos se vuelven a comprobar al mostrar cada
        uno.
      </Text>

      {currentSubject && selectedQuestionsHref ? (
        <View style={styles.contextSection}>
          <Text style={styles.contextLabel}>
            Materia actual: {currentSubject.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver preguntas de ${currentSubject.name}`}
            accessibilityHint="Abre preguntas de la materia. El servidor vuelve a comprobar lectura y contexto."
            onPress={() => router.push(selectedQuestionsHref)}
            style={styles.secondaryButton}
          >
            <Text style={styles.buttonLabel}>Preguntas de mi materia</Text>
          </Pressable>
          {exploreCurrentSubject ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={exploreCurrentSubject.accessibilityLabel}
              accessibilityHint={exploreCurrentSubject.accessibilityHint}
              onPress={() => router.push(exploreCurrentSubject.href)}
              style={styles.secondaryButton}
            >
              <Text style={styles.buttonLabel}>
                Explorar apuntes de mi materia
              </Text>
            </Pressable>
          ) : null}
          {current?.kind === "ready" && current.items.length > 0 ? (
            <View accessibilityRole="radiogroup" style={styles.scopeChoices}>
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel="Todos los apuntes abiertos recientemente"
                accessibilityState={{ checked: recentScope === "all" }}
                onPress={() => setRecentScope("all")}
                style={[
                  styles.scopeChoice,
                  recentScope === "all" && styles.scopeChoiceSelected,
                ]}
              >
                <Text style={styles.buttonLabel}>Todos</Text>
              </Pressable>
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel="Solo apuntes recientes de mi materia actual"
                accessibilityState={{ checked: recentScope === "current" }}
                onPress={() => setRecentScope("current")}
                style={[
                  styles.scopeChoice,
                  recentScope === "current" && styles.scopeChoiceSelected,
                ]}
              >
                <Text style={styles.buttonLabel}>
                  Mi materia ({subjectItems.length} de esta vista)
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {!current || current.kind === "loading" ? (
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel="Comprobando recursos recientes" />
          <Text style={styles.copy}>Comprobando tus apuntes recientes…</Text>
        </View>
      ) : current.kind === "failure" ? (
        <View style={styles.section}>
          <Text accessibilityRole="alert" style={styles.error}>
            {failureCopy[current.reason]}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar recursos abiertos recientemente"
            onPress={() =>
              void controller.load(
                authorityKey,
                sessionAuthorityKey,
                preferredSubjectId,
              )
            }
            style={styles.secondaryButton}
          >
            <Text style={styles.buttonLabel}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.section}>
          {visibleItems.length === 0 ? (
            <Text style={styles.copy}>
              {recentScope === "current" && currentSubject
                ? "Todavía no abriste apuntes de tu materia actual en esta sesión. Elegí Todos para ver otras materias."
                : "Todavía no hay apuntes abiertos disponibles en esta sesión. Entrá a un recurso desde Buscar o tus guardados para verlo acá."}
            </Text>
          ) : (
            visibleItems.map((resource) => {
              const questionsAction = savedSubjectQuestionsAction(resource);
              return (
                <View key={resource.id} style={styles.recentRow}>
                  {preferredSubjectId === resource.academic.subject.id ? (
                    <Text style={styles.contextLabel}>
                      De tu materia actual
                    </Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Volver a abrir ${resource.title}, ${resource.academic.subject.name}`}
                    accessibilityHint="El detalle volverá a validar tus permisos de lectura."
                    onPress={() =>
                      router.push({
                        pathname: "/resources/[id]",
                        params: { id: resource.id },
                      })
                    }
                    style={styles.resourceButton}
                  >
                    <Text numberOfLines={2} style={styles.resourceTitle}>
                      {resource.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.resourceSubject}>
                      {resource.academic.subject.name}
                    </Text>
                    <Text style={styles.buttonLabel}>Volver al apunte</Text>
                  </Pressable>
                  {questionsAction ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={questionsAction.accessibilityLabel}
                      accessibilityHint={questionsAction.accessibilityHint}
                      onPress={() => router.push(questionsAction.href)}
                      style={styles.questionButton}
                    >
                      <Text style={styles.buttonLabel}>
                        Preguntas de esta materia
                      </Text>
                    </Pressable>
                  ) : null}
                  <MobileResourceShareAction
                    key={resource.id}
                    resourceId={resource.id}
                    resourceTitle={resource.title}
                  />
                </View>
              );
            })
          )}
          {current.moreAvailable && recentScope === "all" ? (
            <Text style={styles.copy}>
              Se muestran hasta cuatro apuntes de esta sesión.
            </Text>
          ) : null}
          {current.partialFailure ? (
            <Text accessibilityRole="alert" style={styles.error}>
              Algunos apuntes no pudieron comprobarse. Probá actualizar la
              lista.
            </Text>
          ) : null}
          {current.partialFailure ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar verificación de apuntes recientes"
              onPress={() =>
                void controller.load(
                  authorityKey,
                  sessionAuthorityKey,
                  preferredSubjectId,
                )
              }
              style={styles.secondaryButton}
            >
              <Text style={styles.buttonLabel}>Volver a comprobar</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {current?.kind === "ready" && current.items.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Limpiar apuntes abiertos en esta sesión"
          accessibilityHint="No borra ningún apunte ni modifica tus guardados."
          onPress={() => controller.clear(authorityKey, sessionAuthorityKey)}
          style={styles.clearButton}
        >
          <Text style={styles.clearLabel}>
            Limpiar recientes de esta sesión
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e4e1eb",
  },
  heading: {
    fontSize: 17,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: {
    fontSize: 14,
    lineHeight: 20,
    color: "#5b5b66",
  },
  section: { gap: 8 },
  contextSection: { gap: 8 },
  contextLabel: { fontSize: 13, fontWeight: "700", color: "#43376a" },
  scopeChoices: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  scopeChoice: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#b8b1cb",
  },
  scopeChoiceSelected: { backgroundColor: "#eeeaf8" },
  recentRow: { gap: 6 },
  questionButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: "#f1eff8",
    paddingHorizontal: 12,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  loading: { flexDirection: "row", alignItems: "center", gap: 10 },
  resourceButton: {
    gap: 4,
    minHeight: 58,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e4e1eb",
    backgroundColor: "#faf9fd",
  },
  resourceTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#292635",
  },
  resourceSubject: {
    fontSize: 13,
    color: "#5b5b66",
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#43376a",
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#b8b1cb",
  },
  clearButton: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f1eff8",
  },
  clearLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#43376a",
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
});
