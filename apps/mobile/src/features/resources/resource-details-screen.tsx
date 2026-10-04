import type { ResourceView } from "@losapuntes/contracts";
import { Redirect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";
import {
  useFencedDetail,
  type FencedDetailSnapshot,
} from "@/features/search/use-fenced-detail";

import {
  MobileResourceDetailController,
  type MobileResourceDetailSnapshot,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";
import { mobileResourceConsumptionApi } from "./resource-runtime";

const detailFailureCopy: Record<string, string> = {
  offline: "No hay conexión. Volvé a intentarlo cuando estés en línea.",
  timeout: "El servidor tardó demasiado en responder.",
  server_unavailable: "Este recurso no está disponible ahora.",
  restricted: "La cuenta no puede acceder a este recurso.",
  error: "No pudimos cargar este recurso.",
};

const actionFailureCopy: Record<ResourceConsumptionFailure, string> = {
  offline: "No hay conexión. Reintentá cuando vuelva.",
  timeout: "La operación tardó demasiado. Reintentá.",
  server_unavailable: "El servidor no puede completar esta operación ahora.",
  forbidden: "Ya no tenés permiso para acceder a este recurso.",
  not_found: "El recurso ya no está disponible.",
  restricted: "La cuenta no puede usar este recurso.",
  error: "No pudimos completar la operación.",
};

function useActiveAppState() {
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  return appState;
}

function DetailsFrame({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <ProductSurface
      title="Recurso"
      description="El archivo se autoriza contra el servidor cada vez que lo abrís."
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backLabel}>Volver</Text>
      </Pressable>
      {children}
    </ProductSurface>
  );
}

function DetailState({
  snapshot,
  authorityKey,
  onRetry,
  children,
}: {
  snapshot: FencedDetailSnapshot<{ resource: ResourceView }>;
  authorityKey: string | null;
  onRetry: () => void;
  children: (resource: ResourceView) => ReactNode;
}) {
  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;

  if (current?.kind === "ready") return children(current.data.resource);

  if (!current || current.kind === "loading") {
    return (
      <View style={styles.card}>
        <View style={styles.loadingRow}>
          <ActivityIndicator accessibilityLabel="Cargando recurso" />
          <Text style={styles.copy}>Cargando recurso autorizado…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text accessibilityRole="alert" style={styles.error}>
        {detailFailureCopy[current.kind] ?? detailFailureCopy.error}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

export function MobileResourceDetailsScreen({
  resourceId,
  initialSaved = null,
}: {
  resourceId: string;
  initialSaved?: boolean | null;
}) {
  const { snapshot: session } = useSession();
  const appState = useActiveAppState();
  const controller = useMemo(
    () => new MobileResourceDetailController(mobileResourceConsumptionApi),
    [],
  );
  const [action, setAction] = useState<MobileResourceDetailSnapshot>(
    controller.getSnapshot(),
  );
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const scopeKey =
    sessionAuthority && resourceId
      ? `${sessionAuthority}:resource:${resourceId}`
      : null;
  const authorityKey = appState === "active" ? scopeKey : null;
  const load = useCallback(
    (signal: AbortSignal) =>
      mobileResourceConsumptionApi.resource(resourceId, signal),
    [resourceId],
  );
  const { snapshot, retry } = useFencedDetail(authorityKey, load);

  useEffect(() => controller.subscribe(setAction), [controller]);

  useEffect(() => {
    if (!scopeKey) {
      controller.invalidate();
      return;
    }

    controller.setScope(scopeKey, resourceId, initialSaved);
    if (appState !== "active") {
      controller.suspend(scopeKey);
      return;
    }

    return () => controller.suspend(scopeKey);
  }, [appState, controller, initialSaved, resourceId, scopeKey]);

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;

  if (!resourceId) {
    return (
      <DetailsFrame>
        <View style={styles.card}>
          <Text style={styles.copy}>No pudimos reconocer este recurso.</Text>
        </View>
      </DetailsFrame>
    );
  }

  const currentAction =
    action.kind === "ready" && action.authorityKey === scopeKey ? action : null;

  const openFile = async () => {
    if (!authorityKey) return;
    setHandoffError(null);
    const result = await controller.access(authorityKey, resourceId);
    if (!result) return;

    try {
      await Linking.openURL(result.access.url);
    } catch {
      setHandoffError(
        "El archivo fue autorizado, pero el dispositivo no pudo abrirlo.",
      );
    }
  };

  const toggleSaved = async () => {
    if (!authorityKey || !currentAction) return;
    setHandoffError(null);

    if (currentAction.saved === true) {
      await controller.unsave(authorityKey, resourceId);
    } else {
      await controller.save(authorityKey, resourceId);
    }
  };

  return (
    <DetailsFrame>
      <DetailState
        snapshot={snapshot}
        authorityKey={authorityKey}
        onRetry={retry}
      >
        {(resource) => (
          <>
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.title}>
                {resource.title}
              </Text>
              <Text style={styles.meta}>{resource.academic.subject.name}</Text>
              {resource.academic.courseOffering ? (
                <Text style={styles.meta}>
                  {resource.academic.courseOffering.name}
                </Text>
              ) : null}
              {resource.author ? (
                <Text style={styles.meta}>
                  Por {resource.author.displayName}
                </Text>
              ) : null}
              {resource.description ? (
                <Text style={styles.copy}>{resource.description}</Text>
              ) : (
                <Text style={styles.copy}>
                  Este recurso no tiene descripción.
                </Text>
              )}
              {resource.tags.length > 0 ? (
                <Text style={styles.meta}>
                  Etiquetas: {resource.tags.join(", ")}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                Archivo: {resource.file.filename} · {resource.file.mimeType}
              </Text>
              <Text style={styles.meta}>
                Visibilidad: {resource.visibility}
              </Text>
            </View>

            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Acciones
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Abrir archivo de ${resource.title}`}
                disabled={!currentAction || currentAction.busy !== null}
                onPress={() => void openFile()}
                style={[
                  styles.primaryButton,
                  (!currentAction || currentAction.busy !== null) &&
                    styles.disabledButton,
                ]}
              >
                {currentAction?.busy === "access" ? (
                  <ActivityIndicator accessibilityLabel="Autorizando archivo" />
                ) : (
                  <Text style={styles.primaryButtonText}>Abrir archivo</Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  currentAction?.saved === true
                    ? `Quitar ${resource.title} de guardados`
                    : `Guardar ${resource.title}`
                }
                disabled={!currentAction || currentAction.busy !== null}
                onPress={() => void toggleSaved()}
                style={[
                  styles.secondaryButton,
                  (!currentAction || currentAction.busy !== null) &&
                    styles.disabledButton,
                ]}
              >
                <Text style={styles.secondaryButtonText}>
                  {currentAction?.busy === "save"
                    ? "Guardando…"
                    : currentAction?.busy === "unsave"
                      ? "Quitando…"
                      : currentAction?.saved === true
                        ? "Quitar de guardados"
                        : "Guardar"}
                </Text>
              </Pressable>

              {currentAction?.saved === true ? (
                <Text accessibilityLiveRegion="polite" style={styles.success}>
                  Guardado en tu biblioteca.
                </Text>
              ) : null}

              {currentAction?.failure ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {actionFailureCopy[currentAction.failure]}
                </Text>
              ) : null}

              {handoffError ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {handoffError}
                </Text>
              ) : null}

              <Text style={styles.helper}>
                La URL firmada se usa sólo para este intento de apertura y no se
                guarda como permiso local.
              </Text>
            </View>
          </>
        )}
      </DetailState>
    </DetailsFrame>
  );
}

const styles = StyleSheet.create({
  backButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  backLabel: {
    color: "#43366a",
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    gap: 12,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: "#20202a",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: {
    fontSize: 14,
    lineHeight: 21,
    color: "#55555f",
  },
  meta: {
    fontSize: 13,
    lineHeight: 19,
    color: "#656570",
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
    color: "#6b6b75",
  },
  loadingRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#3446a2",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: "#24243a",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.48,
  },
  success: {
    fontSize: 14,
    lineHeight: 20,
    color: "#17643a",
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
});
