import type { OwnedResourceStatistics } from "@losapuntes/contracts";
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
import { MobileResourceShareAction } from "@/features/resources/resource-share-action";
import { useSession } from "@/features/session/session-provider";

import type { ResourceConsumptionFailure } from "./resource-consumption-controller";
import {
  MobileOwnerStatisticsController,
  type OwnerStatisticsSnapshot,
} from "./resource-owner-stats-controller";
import { mobileOwnerStatisticsApi } from "./resource-runtime";

const failureCopy: Record<ResourceConsumptionFailure, string> = {
  offline: "No hay conexión para consultar tus estadísticas.",
  timeout: "La consulta está tardando demasiado.",
  server_unavailable: "No pudimos consultar los datos en este momento.",
  forbidden: "Tu sesión no puede consultar estas estadísticas.",
  not_found: "Las estadísticas ya no están disponibles.",
  restricted: "Tu cuenta tiene restringida esta consulta.",
  error: "No pudimos cargar las estadísticas.",
};

function Metric({
  label,
  count,
  explanation,
}: {
  label: string;
  count: number;
  explanation: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricCount}>{count.toLocaleString("es-AR")}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.meta}>{explanation}</Text>
    </View>
  );
}

function OwnerStatisticsData({
  data,
  onOpen,
}: {
  data: OwnedResourceStatistics;
  onOpen: (resourceId: string) => void;
}) {
  const maxSaves = Math.max(
    1,
    ...data.topResources.map((resource) => resource.saves),
  );
  return (
    <>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Resumen de publicaciones
        </Text>
        <Metric
          label="Apuntes publicados"
          count={data.publications.total}
          explanation="Publicaciones disponibles para gestionar actualmente."
        />
        <View style={styles.twoColumns}>
          <View style={styles.column}>
            <Metric
              label="Privados"
              count={data.publications.private}
              explanation="Solo para vos."
            />
          </View>
          <View style={styles.column}>
            <Metric
              label="Compartidos"
              count={data.publications.shared}
              explanation="Con permisos explícitos."
            />
          </View>
          <View style={styles.column}>
            <Metric
              label="Públicos"
              count={data.publications.public}
              explanation="De consulta pública."
            />
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Interacción actual
        </Text>
        <Metric
          label="Guardados vigentes"
          count={data.currentSaves}
          explanation="Cantidad de recursos guardados por usuarios, sumada entre tus apuntes disponibles. No incluye guardados eliminados."
        />
        <Metric
          label="Permisos individuales activos"
          count={data.activeShareGrants}
          explanation="Concesiones vigentes sobre apuntes compartidos. Una misma persona con acceso a dos apuntes cuenta dos permisos."
        />
      </View>

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          Tus apuntes más guardados
        </Text>
        <Text style={styles.meta}>
          Ranking actual por cantidad de guardados. No representa
          visualizaciones, descargas ni popularidad histórica.
        </Text>
        {data.topResources.length === 0 ? (
          <Text style={styles.meta}>
            Todavía no hay apuntes disponibles para mostrar estadísticas.
          </Text>
        ) : (
          data.topResources.map((resource, index) => (
            <View key={resource.id} style={styles.rankingRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Abrir ${resource.title}. ${resource.saves} guardados vigentes, ${resource.shareGrants} permisos activos`}
                onPress={() => onOpen(resource.id)}
                style={styles.rankingOpen}
              >
                <Text style={styles.rowTitle}>
                  {index + 1}. {resource.title}
                </Text>
                <Text style={styles.meta}>
                  {resource.saves} guardados · {resource.shareGrants} permisos
                  individuales activos
                </Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width:
                          `${Math.round((resource.saves / maxSaves) * 100)}%` as `${number}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.actionText}>Abrir apunte</Text>
              </Pressable>
              <MobileResourceShareAction
                resourceId={resource.id}
                resourceTitle={resource.title}
              />
            </View>
          ))
        )}
      </View>
      <Text style={styles.disclaimer}>
        Actualizado: {new Date(data.generatedAt).toLocaleString("es-AR")}. Datos
        calculados a partir de los registros actuales, no de un historial de
        aperturas. Se excluyen recursos ocultados por moderación.
      </Text>
    </>
  );
}

export function OwnerResourceStatisticsScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const { snapshot: session } = useSession();
  const [appState, setAppState] = useState(AppState.currentState);
  const controller = useMemo(
    () => new MobileOwnerStatisticsController(mobileOwnerStatisticsApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<OwnerStatisticsSnapshot>(
    controller.getSnapshot(),
  );
  const sessionKey =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey = focused && appState === "active" ? sessionKey : null;

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", setAppState);
    return () => listener.remove();
  }, []);

  useEffect(() => {
    if (!authorityKey) {
      controller.invalidate();
      return;
    }
    void controller.load(authorityKey);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, controller]);

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;

  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;
  const refresh = () => {
    if (authorityKey) void controller.load(authorityKey);
  };

  return (
    <ProductSurface
      title="Estadísticas de mis apuntes"
      description="Conocé cuántos guardados y permisos vigentes tienen tus publicaciones."
      refreshing={current?.kind === "loading"}
      onRefresh={authorityKey ? refresh : undefined}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver a Mis apuntes"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.actionText}>Volver a Mis apuntes</Text>
      </Pressable>

      {!current || current.kind === "loading" ? (
        <View style={styles.card}>
          <ActivityIndicator accessibilityLabel="Cargando estadísticas" />
          <Text style={styles.meta}>Calculando estadísticas actuales…</Text>
        </View>
      ) : current.kind === "failure" ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {failureCopy[current.failure]}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={refresh}
            style={styles.retry}
          >
            <Text style={styles.actionText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <OwnerStatisticsData
          data={current.data}
          onOpen={(id) =>
            router.push({
              pathname: "/resources/[id]",
              params: { id },
            })
          }
        />
      )}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  title: { fontSize: 18, fontWeight: "700", color: "#20202a" },
  metric: { gap: 4 },
  metricCount: {
    fontSize: 28,
    fontWeight: "800",
    color: "#24243a",
  },
  metricLabel: { fontSize: 15, fontWeight: "700", color: "#20202a" },
  meta: { fontSize: 13, color: "#686875", lineHeight: 19 },
  twoColumns: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  column: { minWidth: 100, flex: 1 },
  rankingRow: {
    gap: 8,
    borderWidth: 1,
    borderColor: "#e1e0e8",
    borderRadius: 12,
    padding: 12,
  },
  rankingOpen: { gap: 8, minHeight: 44, justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700", color: "#20202a" },
  barTrack: {
    height: 8,
    backgroundColor: "#ebe9f3",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: { backgroundColor: "#60519a", height: 8, borderRadius: 4 },
  actionText: { fontSize: 14, fontWeight: "700", color: "#43366a" },
  disclaimer: { fontSize: 12, lineHeight: 18, color: "#686875" },
  error: { fontSize: 14, color: "#a12020", lineHeight: 20 },
  retry: {
    minHeight: 44,
    borderColor: "#c9c9d2",
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
