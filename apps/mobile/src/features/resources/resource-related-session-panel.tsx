import type { ResourceView } from "@losapuntes/contracts";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { mobileResourceConsumptionApi } from "./resource-runtime";
import { mobileSessionRecentResourceOpens } from "./recent-opened-memory";
import { savedSubjectQuestionsAction } from "./saved-subject-questions-action";
import {
  ResourceRelatedSessionController,
  type ResourceRelatedSessionSnapshot,
} from "./resource-related-session-controller";

const errorCopy: Record<
  Extract<ResourceRelatedSessionSnapshot, { kind: "failure" }>["reason"],
  string
> = {
  offline: "No hay conexión para verificar los apuntes de esta materia.",
  timeout: "La verificación de apuntes tardó demasiado.",
  server_unavailable: "No pudimos comprobar estos apuntes ahora.",
  forbidden: "No pudimos comprobar tus permisos para estos apuntes.",
  not_found: "Algunos apuntes ya no están disponibles.",
  restricted: "Tu cuenta no puede consultar estos recursos.",
  error: "No pudimos verificar los apuntes recientes de esta materia.",
};

/**
 * Mounted exclusively inside an authorized resource DetailState.
 * Never reads or renders resource metadata from the ID-only session memory.
 */
export function ResourceRelatedSessionPanel({
  currentResource,
  authorityKey,
  sessionAuthorityKey,
}: {
  currentResource: ResourceView;
  authorityKey: string;
  sessionAuthorityKey: string | null;
}) {
  const router = useRouter();
  const controller = useMemo(
    () => new ResourceRelatedSessionController(
      mobileResourceConsumptionApi,
      mobileSessionRecentResourceOpens,
    ),
    [],
  );
  const [snapshot, setSnapshot] = useState<ResourceRelatedSessionSnapshot>(
    controller.getSnapshot(),
  );
  const currentResourceId = currentResource.id;
  const subjectId = currentResource.academic.subject.id;
  const questionsAction = savedSubjectQuestionsAction(currentResource);

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => {
    if (!sessionAuthorityKey || !authorityKey) {
      controller.invalidate();
      return;
    }
    void controller.load(
      authorityKey,
      sessionAuthorityKey,
      currentResourceId,
      subjectId,
    );
    return () => controller.invalidate(authorityKey);
  }, [controller, authorityKey, sessionAuthorityKey, currentResourceId, subjectId]);

  if (!sessionAuthorityKey) return null;
  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Seguí con esta materia
      </Text>
      <Text style={styles.description}>
        Volvé a otros apuntes de {currentResource.academic.subject.name} que
        abriste en esta sesión. Se comprueban sus permisos antes de mostrarlos.
      </Text>
      {questionsAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={questionsAction.accessibilityLabel}
          accessibilityHint={questionsAction.accessibilityHint}
          onPress={() => router.push(questionsAction.href)}
          style={styles.questionsButton}
        >
          <Text style={styles.buttonText}>Ver preguntas de esta materia</Text>
        </Pressable>
      ) : null}

      {!current || current.kind === "loading" ? (
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel="Verificando apuntes de esta materia" />
          <Text style={styles.description}>Comprobando apuntes recientes…</Text>
        </View>
      ) : current.kind === "failure" ? (
        <View style={styles.content}>
          <Text accessibilityRole="alert" style={styles.error}>
            {errorCopy[current.reason]}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar apuntes relacionados de esta sesión"
            onPress={() => void controller.load(
              authorityKey,
              sessionAuthorityKey,
              currentResourceId,
              subjectId,
            )}
            style={styles.secondaryButton}
          >
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.content}>
          {current.items.length === 0 ? (
            <Text style={styles.description}>
              Todavía no abriste otros apuntes de esta materia durante esta sesión.
            </Text>
          ) : current.items.map((related) => (
            <Pressable
              key={related.id}
              accessibilityRole="button"
              accessibilityLabel={`Abrir apunte reciente de esta materia: ${related.title}`}
              accessibilityHint="El detalle volverá a comprobar los permisos antes de mostrar el apunte."
              onPress={() => router.push({
                pathname: "/resources/[id]",
                params: { id: related.id },
              })}
              style={styles.relatedButton}
            >
              <Text style={styles.relatedTitle} numberOfLines={2}>
                {related.title}
              </Text>
              <Text style={styles.buttonText}>Volver al apunte</Text>
            </Pressable>
          ))}
          {current.moreAvailable ? (
            <Text style={styles.description}>
              Se muestran hasta tres apuntes abiertos previamente en esta sesión.
            </Text>
          ) : null}
          {current.partialFailure ? (
            <View style={styles.content}>
              <Text accessibilityRole="alert" style={styles.error}>
                No se pudieron comprobar todos tus apuntes recientes.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver a verificar apuntes recientes de esta materia"
                onPress={() => void controller.load(
                  authorityKey,
                  sessionAuthorityKey,
                  currentResourceId,
                  subjectId,
                )}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Volver a comprobar</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 18,
    backgroundColor: "#ffffff",
    borderRadius: 18,
  },
  heading: {
    fontSize: 17,
    fontWeight: "700",
    color: "#20202a",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: "#595965",
  },
  content: { gap: 8 },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  questionsButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#f1eff8",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondaryButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c9c9d2",
  },
  relatedButton: {
    gap: 4,
    minHeight: 52,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e4e1eb",
    backgroundColor: "#faf9fd",
    padding: 12,
  },
  relatedTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#20202a",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#43366a",
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
});
