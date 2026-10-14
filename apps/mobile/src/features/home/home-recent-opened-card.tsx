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
import {
  mobileSessionRecentResourceOpens,
} from "@/features/resources/recent-opened-memory";

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
}: {
  authorityKey: string | null;
  sessionAuthorityKey: string | null;
}) {
  const router = useRouter();
  const controller = useMemo(
    () => new HomeRecentOpenedController(
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
    void controller.load(authorityKey, sessionAuthorityKey);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, sessionAuthorityKey, controller]);

  if (!authorityKey || !sessionAuthorityKey) return null;
  const current = snapshot.kind !== "idle" &&
    snapshot.authorityKey === authorityKey ? snapshot : null;

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Abiertos recientemente
      </Text>
      <Text style={styles.copy}>
        Apuntes cuyo detalle abriste en esta sesión. No registra progreso ni
        lectura del archivo. Los permisos se vuelven a comprobar al mostrar cada uno.
      </Text>

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
            onPress={() => void controller.load(authorityKey, sessionAuthorityKey)}
            style={styles.secondaryButton}
          >
            <Text style={styles.buttonLabel}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.section}>
          {current.items.length === 0 ? (
            <Text style={styles.copy}>
              Todavía no hay apuntes abiertos disponibles en esta sesión.
              Entrá a un recurso desde Buscar o tus guardados para verlo acá.
            </Text>
          ) : (
            current.items.map((resource) => (
              <Pressable
                key={resource.id}
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
            ))
          )}
          {current.moreAvailable ? (
            <Text style={styles.copy}>
              Se muestran hasta cuatro apuntes de esta sesión.
            </Text>
          ) : null}
          {current.partialFailure ? (
            <Text accessibilityRole="alert" style={styles.error}>
              Algunos apuntes no pudieron comprobarse. Probá actualizar la lista.
            </Text>
          ) : null}
          {current.partialFailure ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar verificación de apuntes recientes"
              onPress={() => void controller.load(authorityKey, sessionAuthorityKey)}
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
          <Text style={styles.clearLabel}>Limpiar recientes de esta sesión</Text>
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
