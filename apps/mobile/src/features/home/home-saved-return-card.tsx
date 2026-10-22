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

import {
  HomeSavedReturnController,
  type HomeSavedReturnSnapshot,
} from "./home-saved-return-controller";

const failureCopy: Record<
  Extract<HomeSavedReturnSnapshot, { kind: "failure" }>["reason"],
  string
> = {
  offline:
    "Sin conexión. Tus guardados se consultarán cuando vuelvas a tener red.",
  timeout: "La consulta tardó demasiado. Podés reintentar.",
  server_unavailable: "No pudimos consultar tus guardados ahora.",
  forbidden: "No se pudo revalidar el acceso a tus guardados.",
  not_found: "No encontramos la biblioteca para esta sesión.",
  restricted: "La cuenta no puede acceder a sus guardados.",
  error: "No pudimos consultar tus guardados.",
};

export function HomeSavedReturnCard({
  authorityKey,
}: {
  authorityKey: string | null;
}) {
  const router = useRouter();
  const controller = useMemo(
    () => new HomeSavedReturnController(mobileResourceConsumptionApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<HomeSavedReturnSnapshot>(
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

  // Responses belonging to an old session, account or academic context are
  // never rendered, even during the render before the effect cleanup runs.
  if (!authorityKey) return null;
  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Retomá tus guardados
      </Text>
      <Text style={styles.copy}>
        Abrí un apunte guardado, consultá preguntas de su materia o explorá tu
        biblioteca. El servidor vuelve a comprobar los permisos actuales.
      </Text>

      {!current || current.kind === "loading" ? (
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel="Consultando apuntes guardados" />
          <Text style={styles.copy}>Consultando tus guardados…</Text>
        </View>
      ) : current.kind === "failure" ? (
        <View style={styles.section}>
          <Text accessibilityRole="alert" style={styles.error}>
            {failureCopy[current.reason]}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar consulta de apuntes guardados"
            onPress={() => void controller.load(authorityKey)}
            style={styles.secondaryAction}
          >
            <Text style={styles.actionLabel}>Reintentar</Text>
          </Pressable>
        </View>
      ) : current.items.length === 0 ? (
        <View style={styles.section}>
          <Text style={styles.copy}>
            {current.moreAvailable
              ? "Los guardados de esta primera página ya no están disponibles. Podés cargar más desde tu biblioteca."
              : "Todavía no tenés apuntes guardados disponibles. Encontrá uno desde Buscar."}
          </Text>
          {!current.moreAvailable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Buscar apuntes para guardar"
              onPress={() => router.navigate("/(tabs)/search")}
              style={styles.secondaryAction}
            >
              <Text style={styles.actionLabel}>Buscar apuntes</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.items}>
          {current.items.map((resource) => {
            const questionsAction = savedSubjectQuestionsAction(resource);
            return (
              <View key={resource.id} style={styles.savedItem}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir ${resource.title}, ${resource.academic.subject.name}`}
                  accessibilityHint="Abre el detalle, que vuelve a validar la visibilidad y el acceso al archivo."
                  onPress={() =>
                    router.push({
                      pathname: "/resources/[id]",
                      params: { id: resource.id },
                    })
                  }
                  style={({ pressed }) => [
                    styles.resourceAction,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text numberOfLines={2} style={styles.resourceTitle}>
                    {resource.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.resourceSubject}>
                    {resource.academic.subject.name}
                  </Text>
                  <Text style={styles.openLabel}>Abrir apunte</Text>
                </Pressable>
                {questionsAction ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={questionsAction.accessibilityLabel}
                    accessibilityHint={questionsAction.accessibilityHint}
                    onPress={() => router.push(questionsAction.href)}
                    style={({ pressed }) => [
                      styles.subjectQuestionsAction,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.subjectQuestionsLabel}>
                      Preguntas de la materia
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
          })}
          {current.moreAvailable ? (
            <Text style={styles.copy}>
              Se muestran hasta tres guardados disponibles de la primera página.
              Puede haber más en tu biblioteca.
            </Text>
          ) : null}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ver todos mis apuntes guardados"
        onPress={() => router.push("/saved-resources")}
        style={styles.primaryAction}
      >
        <Text style={styles.primaryLabel}>Ver todos mis guardados</Text>
      </Pressable>
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
  loading: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    gap: 10,
  },
  section: {
    gap: 10,
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
  items: {
    gap: 8,
  },
  savedItem: {
    gap: 6,
  },
  resourceAction: {
    gap: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e4e1eb",
    minHeight: 68,
    backgroundColor: "#faf9fd",
  },
  subjectQuestionsAction: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    alignSelf: "flex-start",
    backgroundColor: "#f1eff8",
  },
  subjectQuestionsLabel: {
    color: "#43376a",
    fontSize: 14,
    fontWeight: "700",
  },
  pressed: {
    backgroundColor: "#eeeaf8",
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
  openLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#43376a",
  },
  primaryAction: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eeeaf8",
    borderRadius: 12,
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#342b4d",
  },
  secondaryAction: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#b8b1cb",
    borderRadius: 12,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#342b4d",
  },
});
