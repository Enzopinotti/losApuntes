import type { ResourceView } from "@losapuntes/contracts";
import { Redirect, useIsFocused, useRouter } from "expo-router";
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  activeNavigationAuthorityKey,
  navigationAuthorityKey,
} from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";
import { mobileSessionRecentResourceOpens } from "./recent-opened-memory";
import { ResourceRelatedSessionPanel } from "./resource-related-session-panel";
import {
  useFencedDetail,
  type DetailFailureKind,
  type FencedDetailSnapshot,
} from "@/features/search/use-fenced-detail";

import {
  MobileResourceDetailController,
  type MobileResourceDetailSnapshot,
  type ResourceConsumptionFailure,
} from "./resource-consumption-controller";
import {
  resourceAuthorAction,
  resourceFileSizeLabel,
  resourceFileTypeLabel,
  resourceVisibilityLabel,
} from "./resource-details-copy";
import {
  mobileResourceConsumptionApi,
  mobileResourceDirectSharingApi,
} from "./resource-runtime";
import { ResourceDirectSharingPanel } from "./resource-direct-sharing-panel";
import {
  MobileResourceDirectSharingController,
  type ResourceDirectSharingSnapshot,
} from "./resource-direct-sharing-controller";
import { ResourceMetadataEditor } from "./resource-metadata-editor";
import { MobileResourceCitationPanel } from "./resource-citation-panel";
import { ResourceCollectionSaveAction } from "@/features/study-collections/resource-collection-save-action";
import {
  MobileResourceMetadataController,
  type MobileResourceMetadataSnapshot,
} from "./resource-metadata-controller";
import {
  MobileResourceReportController,
  type MobileResourceReportSnapshot,
} from "./resource-report-controller";
import {
  RESOURCE_REPORT_REASONS,
  RESOURCE_REPORT_DETAILS_MAX_LENGTH,
  validateResourceReport,
  type ResourceReportReason,
} from "./resource-report-policy";

const detailFailureCopy: Record<DetailFailureKind, string> = {
  offline: "No hay conexión. Volvé a intentarlo cuando estés en línea.",
  timeout: "El servidor tardó demasiado en responder.",
  server_unavailable: "Este recurso no está disponible ahora.",
  forbidden: "Ya no tenés permiso para acceder a este recurso.",
  not_found: "Este recurso ya no está disponible.",
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

function ResourceAuthorAttribution({
  author,
  onOpenProfile,
}: {
  author: ResourceView["author"];
  onOpenProfile: (profileId: string) => void;
}) {
  if (!author) return null;
  const action = resourceAuthorAction(author);
  if (!action) {
    return <Text style={styles.meta}>Por {author.displayName}</Text>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      accessibilityHint={action.accessibilityHint}
      onPress={() => onOpenProfile(action.profileId)}
      style={styles.authorLink}
    >
      <Text style={styles.meta}>Por {author.displayName}</Text>
    </Pressable>
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
        {detailFailureCopy[current.kind]}
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
  const router = useRouter();
  const { snapshot: session } = useSession();
  const isFocused = useIsFocused();
  const appState = useActiveAppState();
  const controller = useMemo(
    () => new MobileResourceDetailController(mobileResourceConsumptionApi),
    [],
  );
  const [action, setAction] = useState<MobileResourceDetailSnapshot>(
    controller.getSnapshot(),
  );
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const sharingController = useMemo(
    () =>
      new MobileResourceDirectSharingController(mobileResourceDirectSharingApi),
    [],
  );
  const [sharingSnapshot, setSharingSnapshot] =
    useState<ResourceDirectSharingSnapshot>(sharingController.getSnapshot());
  const metadataController = useMemo(
    () => new MobileResourceMetadataController(mobileResourceConsumptionApi),
    [],
  );
  const [metadataSnapshot, setMetadataSnapshot] =
    useState<MobileResourceMetadataSnapshot>(metadataController.getSnapshot());
  const reportController = useMemo(
    () => new MobileResourceReportController(mobileResourceConsumptionApi),
    [],
  );
  const [reportSnapshot, setReportSnapshot] =
    useState<MobileResourceReportSnapshot>(reportController.getSnapshot());
  const [reportFormOpen, setReportFormOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ResourceReportReason | null>(
    null,
  );
  const [reportDetails, setReportDetails] = useState("");
  const announcedNotice = useRef<"saved" | "unsaved" | null>(null);
  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const scopeKey =
    sessionAuthority && resourceId
      ? `${sessionAuthority}:resource:${resourceId}`
      : null;
  const authorityKey = activeNavigationAuthorityKey(
    scopeKey,
    isFocused,
    appState,
  );
  const load = useCallback(
    (signal: AbortSignal) =>
      mobileResourceConsumptionApi.resource(resourceId, signal),
    [resourceId],
  );
  const { snapshot, retry } = useFencedDetail(authorityKey, load);

  // Record only after a fresh, authorized detail response is ready for the
  // active session. Navigating to an ID or encountering a 403/404 does not
  // count as opening an apunte.
  useEffect(() => {
    if (
      sessionAuthority &&
      authorityKey &&
      snapshot.kind === "ready" &&
      snapshot.authorityKey === authorityKey &&
      snapshot.data.resource.id === resourceId
    ) {
      mobileSessionRecentResourceOpens.record(sessionAuthority, resourceId);
    }
  }, [authorityKey, resourceId, sessionAuthority, snapshot]);

  useEffect(() => controller.subscribe(setAction), [controller]);
  useEffect(
    () => sharingController.subscribe(setSharingSnapshot),
    [sharingController],
  );
  useEffect(() => {
    if (!scopeKey) {
      sharingController.invalidate();
      return;
    }
    if (!authorityKey) {
      sharingController.suspend(scopeKey);
      return;
    }
    const readyResource =
      metadataSnapshot.kind === "ready" &&
      metadataSnapshot.authorityKey === scopeKey &&
      metadataSnapshot.resource.id === resourceId
        ? metadataSnapshot.resource
        : snapshot.kind === "ready" &&
            snapshot.authorityKey === authorityKey &&
            snapshot.data.resource.id === resourceId
          ? snapshot.data.resource
          : null;
    if (readyResource?.capabilities.manageShares) {
      sharingController.setScope(scopeKey, readyResource);
    }
  }, [
    authorityKey,
    metadataSnapshot,
    resourceId,
    scopeKey,
    sharingController,
    snapshot,
  ]);
  useEffect(
    () => metadataController.subscribe(setMetadataSnapshot),
    [metadataController],
  );

  useEffect(() => {
    if (!scopeKey) {
      metadataController.invalidate();
      return;
    }
    if (!authorityKey) {
      metadataController.suspend(scopeKey);
      return;
    }
    if (
      snapshot.kind === "ready" &&
      snapshot.authorityKey === authorityKey &&
      snapshot.data.resource.id === resourceId &&
      snapshot.data.resource.capabilities.edit
    ) {
      metadataController.setScope(scopeKey, snapshot.data.resource);
    }
  }, [authorityKey, metadataController, resourceId, scopeKey, snapshot]);
  useEffect(
    () => reportController.subscribe(setReportSnapshot),
    [reportController],
  );

  useEffect(() => {
    setReportFormOpen(false);
    setReportReason(null);
    setReportDetails("");
  }, [scopeKey]);

  useEffect(() => {
    if (!scopeKey) {
      reportController.invalidate();
      return;
    }

    reportController.setScope(scopeKey, resourceId);
    if (!authorityKey) {
      reportController.suspend(scopeKey);
      return;
    }

    return () => reportController.suspend(scopeKey);
  }, [authorityKey, reportController, resourceId, scopeKey]);

  useEffect(() => {
    if (
      !authorityKey ||
      !isFocused ||
      appState !== "active" ||
      action.kind !== "ready" ||
      action.authorityKey !== authorityKey ||
      action.resourceId !== resourceId
    ) {
      announcedNotice.current = null;
      return;
    }

    if (!action.notice) {
      announcedNotice.current = null;
      return;
    }

    if (announcedNotice.current === action.notice) return;

    AccessibilityInfo.announceForAccessibility(
      action.notice === "saved"
        ? "Guardado en tu biblioteca."
        : "Quitado de tus guardados.",
    );
    announcedNotice.current = action.notice;
  }, [action, appState, authorityKey, isFocused, resourceId]);

  useEffect(() => {
    if (!scopeKey) {
      controller.invalidate();
      return;
    }

    controller.setScope(scopeKey, resourceId, initialSaved);
    if (!authorityKey) {
      controller.suspend(scopeKey);
      return;
    }

    return () => controller.suspend(scopeKey);
  }, [authorityKey, controller, initialSaved, resourceId, scopeKey]);

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
    action.kind === "ready" && action.authorityKey === authorityKey
      ? action
      : null;
  const currentMetadata =
    metadataSnapshot.kind === "ready" &&
    metadataSnapshot.authorityKey === authorityKey &&
    metadataSnapshot.resource.id === resourceId
      ? metadataSnapshot
      : null;
  const currentReport =
    reportSnapshot.kind === "ready" &&
    reportSnapshot.authorityKey === authorityKey &&
    reportSnapshot.resourceId === resourceId
      ? reportSnapshot
      : null;
  const reportValidation = validateResourceReport(reportReason, reportDetails);

  const sendReport = async () => {
    if (!authorityKey || !currentReport || reportValidation.kind !== "valid") {
      return;
    }
    await reportController.submit(
      authorityKey,
      resourceId,
      reportValidation.input.reason,
      reportDetails,
    );
  };

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
              <ResourceAuthorAttribution
                author={resource.author}
                onOpenProfile={(profileId) =>
                  router.push({
                    pathname: "/profiles/[profileId]",
                    params: { profileId },
                  })
                }
              />
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
              <Text style={styles.meta}>Archivo: {resource.file.filename}</Text>
              <Text style={styles.meta}>
                Formato: {resourceFileTypeLabel(resource.file.mimeType)}
              </Text>
              <Text style={styles.meta}>
                Tamaño: {resourceFileSizeLabel(resource.file.byteSize)}
              </Text>
              <Text style={styles.meta}>
                Visibilidad:{" "}
                {resourceVisibilityLabel(
                  currentMetadata?.resource.visibility ?? resource.visibility,
                )}
              </Text>
            </View>

            <MobileResourceCitationPanel
              key={resource.id}
              resource={resource}
            />

            {resource.capabilities.edit ? (
              <ResourceMetadataEditor
                authorityKey={authorityKey}
                resource={currentMetadata?.resource ?? resource}
                snapshot={metadataSnapshot}
                controller={metadataController}
                onUpdated={retry}
              />
            ) : null}

            {resource.capabilities.manageShares ? (
              <ResourceDirectSharingPanel
                authorityKey={authorityKey}
                resource={currentMetadata?.resource ?? resource}
                snapshot={sharingSnapshot}
                controller={sharingController}
                onRefresh={retry}
              />
            ) : null}

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

              <ResourceCollectionSaveAction
                key={resource.id}
                resourceId={resource.id}
                resourceTitle={resource.title}
              />

              {currentAction?.notice === "unsaved" ? (
                <Text style={styles.success}>Quitado de tus guardados.</Text>
              ) : currentAction?.saved === true ? (
                <Text style={styles.success}>Guardado en tu biblioteca.</Text>
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

            {authorityKey ? (
              <ResourceRelatedSessionPanel
                currentResource={resource}
                authorityKey={authorityKey}
                sessionAuthorityKey={sessionAuthority}
              />
            ) : null}

            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Ayudanos a cuidar los apuntes
              </Text>
              {currentReport?.outcome === "confirmed" ? (
                <Text accessibilityRole="alert" style={styles.success}>
                  Recibimos tu reporte. Gracias por avisarnos.
                </Text>
              ) : currentReport?.outcome === "uncertain" ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  No pudimos confirmar si se recibió el reporte. Para evitar
                  duplicados, no lo vuelvas a enviar desde esta pantalla.
                </Text>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      reportFormOpen
                        ? "Cerrar formulario para reportar recurso"
                        : `Reportar ${resource.title}`
                    }
                    disabled={!currentReport || currentReport.sending}
                    onPress={() => setReportFormOpen((previous) => !previous)}
                    style={[
                      styles.secondaryButton,
                      (!currentReport || currentReport.sending) &&
                        styles.disabledButton,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {reportFormOpen ? "Cancelar reporte" : "Reportar recurso"}
                    </Text>
                  </Pressable>
                  {reportFormOpen ? (
                    <>
                      <Text style={styles.copy}>
                        Elegí el motivo. El equipo revisará el reporte; no
                        incluyas contraseñas ni datos personales.
                      </Text>
                      <View
                        accessibilityRole="radiogroup"
                        style={styles.reportReasons}
                      >
                        {RESOURCE_REPORT_REASONS.map((reason) => (
                          <Pressable
                            key={reason.value}
                            accessibilityRole="radio"
                            accessibilityLabel={reason.label}
                            accessibilityState={{
                              checked: reportReason === reason.value,
                              disabled: currentReport?.sending ?? true,
                            }}
                            disabled={!currentReport || currentReport.sending}
                            onPress={() => setReportReason(reason.value)}
                            style={[
                              styles.reportReason,
                              reportReason === reason.value &&
                                styles.reportReasonSelected,
                            ]}
                          >
                            <Text style={styles.reportReasonText}>
                              {reason.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={styles.copy}>
                        Detalles adicionales (opcional)
                      </Text>
                      <TextInput
                        accessibilityLabel="Detalles del reporte"
                        accessibilityHint="Opcional. Si escribís algo, usá entre 3 y 1500 caracteres."
                        multiline
                        maxLength={RESOURCE_REPORT_DETAILS_MAX_LENGTH}
                        onChangeText={setReportDetails}
                        placeholder="Explicá brevemente lo ocurrido"
                        style={styles.reportDetails}
                        textAlignVertical="top"
                        value={reportDetails}
                      />
                      {reportReason && reportValidation.kind === "invalid" ? (
                        <Text accessibilityRole="alert" style={styles.error}>
                          {reportValidation.message}
                        </Text>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Enviar reporte de recurso"
                        accessibilityState={{
                          disabled:
                            !currentReport ||
                            currentReport.sending ||
                            reportValidation.kind !== "valid",
                        }}
                        disabled={
                          !currentReport ||
                          currentReport.sending ||
                          reportValidation.kind !== "valid"
                        }
                        onPress={() => void sendReport()}
                        style={[
                          styles.primaryButton,
                          (!currentReport ||
                            currentReport.sending ||
                            reportValidation.kind !== "valid") &&
                            styles.disabledButton,
                        ]}
                      >
                        {currentReport?.sending ? (
                          <ActivityIndicator accessibilityLabel="Enviando reporte" />
                        ) : (
                          <Text style={styles.primaryButtonText}>
                            Enviar reporte
                          </Text>
                        )}
                      </Pressable>
                      {currentReport?.failure ? (
                        <Text accessibilityRole="alert" style={styles.error}>
                          {actionFailureCopy[currentReport.failure]}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
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
  authorLink: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
    color: "#6b6b75",
  },
  reportReasons: {
    gap: 8,
  },
  reportReason: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    justifyContent: "center",
  },
  reportReasonSelected: {
    borderColor: "#43366a",
    backgroundColor: "#f1eff8",
  },
  reportReasonText: {
    color: "#20202a",
    fontSize: 14,
    fontWeight: "600",
  },
  reportDetails: {
    minHeight: 104,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    fontSize: 14,
    color: "#20202a",
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
