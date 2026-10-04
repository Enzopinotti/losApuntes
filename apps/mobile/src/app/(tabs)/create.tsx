import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { useIsFocused } from "expo-router";
import {
  AppState,
  ActivityIndicator,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAcademicContext } from "@/features/academic/academic-context-provider";
import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import {
  ProductSurface,
  productSurfaceStyles,
} from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";
import { ApiRequestError } from "@/services/api/client";

import { mobileResourceUploadController } from "@/features/resources/resource-runtime";
import { ResourcePickedFileLease } from "@/features/resources/resource-picked-file-lease";
import {
  parseResourceTags,
  resourceFileValidationError,
  ResourceUploadError,
} from "@/features/resources/resource-upload-controller";
import {
  RESOURCE_UPLOAD_MIME_TYPES,
  type PickedResourceFile,
  type ResourceUploadProgress,
  type ResourceUploadStage,
} from "@/features/resources/resource-types";

const mimeFromSelection = (mimeType: string, filename: string): string => {
  const normalized = mimeType.trim().toLowerCase();
  if (RESOURCE_UPLOAD_MIME_TYPES.some((allowed) => allowed === normalized)) {
    return normalized;
  }

  const extension = filename.split(".").at(-1)?.toLowerCase();
  const byExtension: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return normalized.length === 0 || normalized === "application/octet-stream"
    ? (byExtension[extension ?? ""] ?? normalized)
    : normalized;
};

const bytesLabel = (byteSize: number): string => {
  if (byteSize < 1024) return `${byteSize} bytes`;
  if (byteSize < 1024 * 1024) return `${Math.ceil(byteSize / 1024)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
};

const stageLabel: Record<ResourceUploadProgress["stage"], string> = {
  intent: "Preparando una subida segura…",
  transfer: "Subiendo el archivo…",
  finalize: "Verificando el archivo…",
  create: "Publicando el recurso…",
};

function errorMessage(error: unknown, uncertainCreate: boolean): string {
  if (uncertainCreate) {
    return "No pudimos confirmar si se publicó. Revisá tus recursos antes de volver a intentarlo.";
  }
  if (error instanceof ResourceUploadError) {
    if (error.code === "RESOURCE_FILE_INVALID") {
      return "El archivo no cumple el tipo o tamaño permitido.";
    }
    if (error.code === "RESOURCE_TAGS_INVALID") {
      return "Usá hasta 12 etiquetas de 40 caracteres cada una.";
    }
    if (error.code === "UPLOAD_CANCELLED") {
      return "La subida fue cancelada. Podés reintentarla.";
    }
    if (error.code.startsWith("STORAGE_UPLOAD")) {
      return "No se pudo transferir el archivo. Revisá tu conexión y reintentá.";
    }
  }
  if (error instanceof ApiRequestError) {
    if (error.kind === "unauthorized") {
      return "La sesión cambió. Iniciá sesión nuevamente antes de publicar.";
    }
    if (error.kind === "forbidden") {
      return "Verificá tu correo y tu acceso antes de publicar recursos.";
    }
    if (
      error.code === "FILE_SCAN_PENDING" ||
      error.code === "FILE_SCAN_UNAVAILABLE"
    ) {
      return "El archivo todavía se está verificando. Podés reintentar en un momento.";
    }
    if (error.kind === "offline" || error.kind === "timeout") {
      return "No hay conexión estable. Podés reintentar cuando vuelva.";
    }
  }
  return "No pudimos completar la publicación. Revisá los datos e intentá otra vez.";
}

function ResourceComposer() {
  const { snapshot: session } = useSession();
  const { snapshot: academic, retry: retryAcademic } = useAcademicContext();
  const isFocused = useIsFocused();
  const [pickedFile, setPickedFile] = useState<PickedResourceFile | null>(null);
  const [selectedParticipationId, setSelectedParticipationId] = useState<
    string | null
  >(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [progress, setProgress] = useState<ResourceUploadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [uncertainCreate, setUncertainCreate] = useState(false);
  const activeAbort = useRef<AbortController | null>(null);
  const pickedFileLease = useRef<ResourcePickedFileLease | null>(null);
  const activeUpload = useRef<Promise<unknown> | null>(null);
  const requestGeneration = useRef(0);
  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const previousSessionAuthority = useRef(sessionAuthority);
  const academicData =
    academic.kind === "ready" || academic.kind === "no_context"
      ? academic.data
      : null;
  const academicScope = academicData
    ? [
        academicData.contextAuthorityKey,
        String(academicData.contextRevision),
        academicData.context?.affiliationId ?? "no-affiliation",
        academicData.context?.subjectParticipationId ?? "no-subject",
      ].join(":")
    : academic.kind;
  const availableParticipations = useMemo(
    () =>
      (academicData?.participations ?? []).filter(
        (participation) =>
          participation.state === "current" ||
          participation.state === "completed",
      ),
    [academicData?.participations],
  );
  const selectedParticipation =
    availableParticipations.find(
      (participation) => participation.id === selectedParticipationId,
    ) ??
    availableParticipations.find(
      (participation) =>
        participation.id === academicData?.context?.subjectParticipationId,
    ) ??
    null;

  useEffect(() => {
    requestGeneration.current += 1;
    activeAbort.current?.abort();
    if (previousSessionAuthority.current !== sessionAuthority) {
      previousSessionAuthority.current = sessionAuthority;
      const staleLease = pickedFileLease.current;
      pickedFileLease.current = null;
      if (staleLease) {
        void staleLease
          .releaseAfter(activeUpload.current ?? undefined)
          .catch(() => undefined);
      }
      mobileResourceUploadController.reset();
      setPickedFile(null);
      setUncertainCreate(false);
      setSelectedParticipationId(null);
      setTitle("");
      setDescription("");
      setTagsText("");
      setFeedback(null);
    }
    setProgress(null);
    setError(null);
  }, [academicScope, sessionAuthority]);

  useEffect(() => {
    if (!isFocused) activeAbort.current?.abort();
  }, [isFocused]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") activeAbort.current?.abort();
    });
    return () => subscription.remove();
  }, []);

  useEffect(
    () => () => {
      requestGeneration.current += 1;
      activeAbort.current?.abort();
      mobileResourceUploadController.reset();
      const lease = pickedFileLease.current;
      pickedFileLease.current = null;
      if (lease) {
        void lease
          .releaseAfter(activeUpload.current ?? undefined)
          .catch(() => undefined);
      }
    },
    [],
  );

  const pickFile = async () => {
    const generation = requestGeneration.current;
    setError(null);
    setFeedback(null);
    try {
      const result = await File.pickFileAsync({
        mimeTypes: [...RESOURCE_UPLOAD_MIME_TYPES],
        multipleFiles: false,
      });
      if (result.canceled) return;

      const file = result.result;
      const lease = new ResourcePickedFileLease(
        file.uri,
        Platform.OS === "ios",
        (uri) => {
          const temporaryCopy = new File(uri);
          if (temporaryCopy.exists) temporaryCopy.delete();
        },
      );
      if (generation !== requestGeneration.current) {
        void lease.releaseAfter().catch(() => undefined);
        return;
      }

      const selected: PickedResourceFile = {
        uri: file.uri,
        name: file.name,
        size: file.size,
        mimeType: mimeFromSelection(file.type, file.name),
        operationKey: Crypto.randomUUID(),
      };
      const validationError = resourceFileValidationError(selected);
      if (validationError) {
        const previousLease = pickedFileLease.current;
        pickedFileLease.current = null;
        if (previousLease) {
          void previousLease.releaseAfter().catch(() => undefined);
        }
        void lease.releaseAfter().catch(() => undefined);
        mobileResourceUploadController.reset();
        setPickedFile(null);
        setUncertainCreate(false);
        setError(validationError);
        return;
      }

      const previousLease = pickedFileLease.current;
      pickedFileLease.current = lease;
      if (previousLease) {
        void previousLease.releaseAfter().catch(() => undefined);
      }
      mobileResourceUploadController.reset();
      setPickedFile(selected);
      setUncertainCreate(false);
      setProgress(null);
    } catch {
      if (generation === requestGeneration.current) {
        setError("No pudimos abrir el selector de archivos. Intentá de nuevo.");
      }
    }
  };

  const clearPickedFile = () => {
    const lease = pickedFileLease.current;
    pickedFileLease.current = null;
    if (lease) void lease.releaseAfter().catch(() => undefined);
    mobileResourceUploadController.reset();
    setPickedFile(null);
    setUncertainCreate(false);
    setProgress(null);
    setError(null);
    setFeedback(null);
  };

  const cancelUpload = () => activeAbort.current?.abort();

  const publish = async () => {
    if (!pickedFile || !selectedParticipation || !sessionAuthority) return;
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2 || trimmedTitle.length > 160) {
      setError("El título debe tener entre 2 y 160 caracteres.");
      return;
    }
    if (description.trim().length > 3000) {
      setError("La descripción no puede superar los 3000 caracteres.");
      return;
    }

    let tags: string[];
    try {
      tags = parseResourceTags(tagsText);
    } catch (nextError) {
      setError(errorMessage(nextError, false));
      return;
    }

    const generation = requestGeneration.current;
    const abort = new AbortController();
    let activeStage: ResourceUploadStage | null = null;
    let uploadPromise: Promise<unknown> | null = null;
    activeAbort.current = abort;
    setBusy(true);
    setProgress(null);
    setError(null);
    setFeedback(null);

    try {
      const upload = mobileResourceUploadController.publish(
        pickedFile,
        {
          title: trimmedTitle,
          ...(description.trim() ? { description: description.trim() } : {}),
          tags,
          subjectId: selectedParticipation.subjectId,
          ...(selectedParticipation.courseOfferingId
            ? { courseOfferingId: selectedParticipation.courseOfferingId }
            : {}),
        },
        (nextProgress) => {
          activeStage = nextProgress.stage;
          if (generation === requestGeneration.current) {
            setProgress(nextProgress);
          }
        },
        abort.signal,
      );
      uploadPromise = upload;
      activeUpload.current = upload;
      const created = await upload;
      const lease = pickedFileLease.current;
      if (lease) {
        pickedFileLease.current = null;
        await lease.releaseAfter(upload).catch(() => undefined);
      }
      if (generation !== requestGeneration.current) return;
      mobileResourceUploadController.reset();
      setPickedFile(null);
      setTitle("");
      setDescription("");
      setTagsText("");
      setSelectedParticipationId(null);
      setUncertainCreate(false);
      setProgress(null);
      setFeedback(`Publicado: ${created.resource.title}. Quedó privado.`);
    } catch (nextError) {
      if (generation !== requestGeneration.current) return;
      const isUncertain =
        (activeStage === "create" &&
          (abort.signal.aborted ||
            !(nextError instanceof ApiRequestError) ||
            nextError.kind === "offline" ||
            nextError.kind === "timeout" ||
            nextError.kind === "server_unavailable" ||
            nextError.code === "RESOURCE_ASSET_UNAVAILABLE")) ||
        (nextError instanceof ResourceUploadError &&
          nextError.code === "RESOURCE_CREATE_OUTCOME_UNCERTAIN");
      setUncertainCreate(isUncertain);
      setError(errorMessage(nextError, isUncertain));
    } finally {
      if (activeUpload.current === uploadPromise) activeUpload.current = null;
      if (activeAbort.current === abort) activeAbort.current = null;
      setBusy(false);
    }
  };

  const authenticated = session.kind === "authenticated";
  const verified = authenticated && session.user.emailVerified;
  const canPublish =
    verified &&
    academicData !== null &&
    selectedParticipation !== null &&
    pickedFile !== null &&
    title.trim().length >= 2 &&
    title.trim().length <= 160 &&
    !busy &&
    !uncertainCreate;

  return (
    <ProductSurface
      title="Crear"
      description="Compartí apuntes y material de cursada. Cada publicación empieza privada y la valida el servidor."
    >
      <View style={styles.card}>
        <Text accessibilityRole="header" style={productSurfaceStyles.cardTitle}>
          Nuevo recurso
        </Text>
        {!authenticated ? (
          <Text style={styles.copy}>
            Iniciá sesión para publicar un recurso.
          </Text>
        ) : !verified ? (
          <Text style={styles.copy}>
            Verificá tu correo para habilitar la publicación.
          </Text>
        ) : academicData === null ? (
          <View style={styles.loadingRow}>
            {academic.kind === "offline" ||
            academic.kind === "timeout" ||
            academic.kind === "server_unavailable" ||
            academic.kind === "error" ? (
              <View style={styles.recoveryCopy}>
                <Text accessibilityRole="alert" style={styles.error}>
                  No pudimos validar tus materias. La publicación queda pausada
                  hasta que el servidor confirme el contexto.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void retryAcademic()}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>
                    Reintentar contexto
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <ActivityIndicator accessibilityLabel="Validando materias" />
                <Text style={styles.copy}>Validando tus materias…</Text>
              </>
            )}
          </View>
        ) : availableParticipations.length === 0 ? (
          <Text style={styles.copy}>
            Elegí una materia actual en Inicio antes de publicar recursos.
          </Text>
        ) : (
          <>
            <Text style={styles.label}>Materia</Text>
            <View accessibilityRole="radiogroup" style={styles.choices}>
              {availableParticipations.map((participation) => {
                const selected = participation.id === selectedParticipation?.id;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: busy }}
                    disabled={busy}
                    key={participation.id}
                    onPress={() => setSelectedParticipationId(participation.id)}
                    style={[styles.choice, selected && styles.choiceSelected]}
                  >
                    <Text style={styles.choiceTitle}>
                      {participation.subjectName}
                    </Text>
                    <Text style={styles.meta}>
                      {[
                        participation.courseOfferingName,
                        participation.periodLabel,
                        participation.state === "completed"
                          ? "Completada"
                          : "Actual",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Archivo</Text>
            {pickedFile ? (
              <View style={styles.fileCard}>
                <Text numberOfLines={2} style={styles.choiceTitle}>
                  {pickedFile.name}
                </Text>
                <Text style={styles.meta}>
                  {pickedFile.mimeType} · {bytesLabel(pickedFile.size)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={clearPickedFile}
                >
                  <Text style={styles.actionText}>Quitar archivo</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                pickedFile ? "Elegir otro archivo" : "Elegir archivo"
              }
              disabled={busy}
              onPress={() => void pickFile()}
              style={[styles.secondaryButton, busy && styles.disabledButton]}
            >
              <Text style={styles.secondaryButtonText}>
                {pickedFile ? "Elegir otro archivo" : "Elegir archivo"}
              </Text>
            </Pressable>
            <Text style={styles.helper}>
              PDF, JPG, PNG o WebP · máximo 50 MiB.
            </Text>

            <Text style={styles.label}>Título</Text>
            <TextInput
              accessibilityLabel="Título del recurso"
              editable={!busy}
              maxLength={160}
              onChangeText={setTitle}
              placeholder="Ej.: Resumen de Álgebra"
              style={styles.input}
              value={title}
            />

            <Text style={styles.label}>Descripción (opcional)</Text>
            <TextInput
              accessibilityLabel="Descripción del recurso"
              editable={!busy}
              maxLength={3000}
              multiline
              onChangeText={setDescription}
              placeholder="Qué incluye el archivo"
              style={[styles.input, styles.multiline]}
              textAlignVertical="top"
              value={description}
            />

            <Text style={styles.label}>Etiquetas (opcional)</Text>
            <TextInput
              accessibilityLabel="Etiquetas separadas por coma"
              editable={!busy}
              maxLength={600}
              onChangeText={setTagsText}
              placeholder="parcial, resumen, unidad 1"
              style={styles.input}
              value={tagsText}
            />

            <View style={styles.privacyNote}>
              <Text style={styles.choiceTitle}>Visibilidad: privada</Text>
              <Text style={styles.copy}>
                Este flujo nativo publica en privado. El servidor controla el
                acceso al archivo.
              </Text>
            </View>

            {busy && progress ? (
              <View
                accessibilityLiveRegion="polite"
                style={styles.progressCard}
              >
                <ActivityIndicator
                  accessibilityLabel={stageLabel[progress.stage]}
                />
                <View style={styles.progressCopy}>
                  <Text style={styles.choiceTitle}>
                    {stageLabel[progress.stage]}
                  </Text>
                  {progress.percent === null ? null : (
                    <Text style={styles.meta}>{progress.percent}%</Text>
                  )}
                </View>
              </View>
            ) : null}

            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            {feedback ? (
              <Text accessibilityLiveRegion="polite" style={styles.success}>
                {feedback}
              </Text>
            ) : null}

            {uncertainCreate ? (
              <Text style={styles.helper}>
                La publicación queda bloqueada para este archivo hasta que
                verifiques si ya aparece en Buscar. Elegir otro archivo inicia
                una nueva publicación.
              </Text>
            ) : null}

            {busy ? (
              <Pressable
                accessibilityRole="button"
                onPress={cancelUpload}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Cancelar subida</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canPublish }}
                disabled={!canPublish}
                onPress={() => void publish()}
                style={[
                  styles.primaryButton,
                  !canPublish && styles.disabledButton,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  Publicar en privado
                </Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </ProductSurface>
  );
}

export default function CreateRoute() {
  return <ResourceComposer />;
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  label: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "700",
    color: "#30303a",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d2d2dc",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#20202a",
    backgroundColor: "#ffffff",
  },
  multiline: {
    minHeight: 96,
  },
  choices: {
    gap: 8,
  },
  choice: {
    gap: 4,
    borderWidth: 1,
    borderColor: "#dedee6",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#ffffff",
  },
  choiceSelected: {
    borderColor: "#4254b5",
    backgroundColor: "#f3f4ff",
  },
  choiceTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#24242d",
  },
  meta: {
    fontSize: 13,
    lineHeight: 19,
    color: "#676773",
  },
  copy: {
    fontSize: 14,
    lineHeight: 21,
    color: "#5b5b66",
  },
  helper: {
    fontSize: 13,
    lineHeight: 19,
    color: "#6b6b75",
  },
  fileCard: {
    gap: 5,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#f7f7fb",
  },
  actionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#36469e",
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#9a9aa8",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#30303a",
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#3446a2",
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
  },
  disabledButton: {
    opacity: 0.48,
  },
  privacyNote: {
    gap: 6,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#f5f5f8",
  },
  loadingRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recoveryCopy: {
    flex: 1,
    gap: 10,
  },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#f5f5f8",
  },
  progressCopy: {
    flex: 1,
    gap: 2,
  },
  error: {
    fontSize: 14,
    lineHeight: 21,
    color: "#9a1d2d",
  },
  success: {
    fontSize: 14,
    lineHeight: 21,
    color: "#17643a",
  },
});
