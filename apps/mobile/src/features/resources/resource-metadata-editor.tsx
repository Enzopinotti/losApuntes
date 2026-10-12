import type { ResourceView } from "@losapuntes/contracts";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  resourceMetadataDraft,
  validateResourceMetadata,
  RESOURCE_DESCRIPTION_MAX_LENGTH,
  RESOURCE_TAG_MAX_COUNT,
  RESOURCE_TAG_MAX_LENGTH,
  RESOURCE_TITLE_MAX_LENGTH,
  type ResourceMetadataDraft,
} from "./resource-metadata-policy";
import {
  MobileResourceMetadataController,
  type MobileResourceMetadataSnapshot,
} from "./resource-metadata-controller";

const errorCopy = {
  offline: "No hay conexión para verificar los cambios.",
  timeout: "El servidor tardó demasiado en responder.",
  server_unavailable: "No pudimos contactar al servidor.",
  forbidden: "Ya no tenés permisos para editar este apunte.",
  not_found: "Este apunte ya no está disponible.",
  restricted: "Tu cuenta no puede modificar este apunte.",
  error: "No pudimos guardar los cambios.",
} as const;

export function ResourceMetadataEditor({
  authorityKey,
  resource,
  snapshot,
  controller,
  onUpdated,
}: {
  authorityKey: string | null;
  resource: ResourceView;
  snapshot: MobileResourceMetadataSnapshot;
  controller: MobileResourceMetadataController;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ResourceMetadataDraft>(
    resourceMetadataDraft(resource),
  );
  const current =
    snapshot.kind === "ready" &&
    snapshot.authorityKey === authorityKey &&
    snapshot.resource.id === resource.id
      ? snapshot
      : null;
  const visible = current?.resource ?? resource;
  const validation = validateResourceMetadata(visible, draft);
  const busy = current?.busy !== null && current?.busy !== undefined;

  useEffect(() => {
    setOpen(false);
    setDraft(resourceMetadataDraft(resource));
  }, [authorityKey, resource.id, resource.revision]);

  useEffect(() => {
    if (current?.outcome === "conflict" || current?.outcome === "saved") {
      setOpen(false);
      setDraft(resourceMetadataDraft(visible));
    }
  }, [current?.outcome, visible.revision]);

  if (!visible.capabilities.edit) return null;

  const start = () => {
    if (!authorityKey || !current || busy || current.outcome === "uncertain") return;
    setDraft(resourceMetadataDraft(current.resource));
    controller.clearOutcome(authorityKey, resource.id);
    setOpen(true);
  };

  const submit = async () => {
    if (!authorityKey || !current || validation.kind !== "valid") return;
    const succeeded = await controller.submit(authorityKey, resource.id, draft);
    const latest = controller.getSnapshot();
    if (
      latest.kind === "ready" &&
      latest.authorityKey === authorityKey &&
      latest.resource.id === resource.id &&
      (succeeded || latest.outcome === "conflict" || latest.outcome === "saved")
    ) {
      setOpen(false);
      onUpdated();
    }
  };

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Editar mi apunte
      </Text>
      {current?.outcome === "saved" ? (
        <Text accessibilityRole="alert" style={styles.success}>
          Los cambios se guardaron en el servidor.
        </Text>
      ) : null}
      {current?.outcome === "conflict" ? (
        <Text accessibilityRole="alert" style={styles.error}>
          El apunte cambió desde otra sesión o dispositivo. Revisá los datos
          actualizados antes de volver a editar.
        </Text>
      ) : null}
      {current?.outcome === "uncertain" ? (
        <>
          <Text accessibilityRole="alert" style={styles.error}>
            No sabemos si el servidor guardó los cambios. Para no pisarlos,
            primero verificá la versión actual.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Consultar versión actual del apunte"
            disabled={!authorityKey || busy}
            onPress={() => {
              if (!authorityKey) return;
              void controller.refresh(authorityKey, resource.id).then((ok) => {
                if (ok) onUpdated();
              });
            }}
            style={[styles.button, busy && styles.disabled]}
          >
            <Text style={styles.buttonText}>Consultar versión actual</Text>
          </Pressable>
        </>
      ) : open ? (
        <>
          <Text style={styles.label}>Título</Text>
          <TextInput
            accessibilityLabel="Título del apunte"
            maxLength={RESOURCE_TITLE_MAX_LENGTH}
            value={draft.title}
            onChangeText={(title) => setDraft((previous) => ({ ...previous, title }))}
            style={styles.input}
          />
          <Text style={styles.label}>Descripción (opcional)</Text>
          <TextInput
            accessibilityLabel="Descripción del apunte"
            multiline
            textAlignVertical="top"
            maxLength={RESOURCE_DESCRIPTION_MAX_LENGTH}
            value={draft.description}
            onChangeText={(description) =>
              setDraft((previous) => ({ ...previous, description }))
            }
            style={[styles.input, styles.description]}
          />
          <Text style={styles.label}>Etiquetas, separadas por comas</Text>
          <TextInput
            accessibilityLabel="Etiquetas del apunte"
            accessibilityHint={`Hasta ${RESOURCE_TAG_MAX_COUNT} etiquetas de ${RESOURCE_TAG_MAX_LENGTH} caracteres cada una.`}
            autoCapitalize="none"
            value={draft.tagsText}
            onChangeText={(tagsText) =>
              setDraft((previous) => ({ ...previous, tagsText }))
            }
            style={styles.input}
          />
          {validation.kind === "invalid" ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {validation.message}
            </Text>
          ) : validation.kind === "unchanged" ? (
            <Text style={styles.helper}>No hay cambios para guardar.</Text>
          ) : null}
          {current?.failure ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorCopy[current.failure]}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Guardar cambios del apunte"
            accessibilityState={{
              disabled: busy || validation.kind !== "valid",
            }}
            disabled={busy || validation.kind !== "valid"}
            onPress={() => void submit()}
            style={[
              styles.primaryButton,
              (busy || validation.kind !== "valid") && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator accessibilityLabel="Guardando apunte" />
            ) : (
              <Text style={styles.primaryText}>Guardar cambios</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar edición del apunte"
            disabled={busy}
            onPress={() => setOpen(false)}
            style={[styles.button, busy && styles.disabled]}
          >
            <Text style={styles.buttonText}>Cancelar</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Editar título, descripción y etiquetas de ${visible.title}`}
          disabled={!authorityKey || busy}
          onPress={start}
          style={[styles.button, busy && styles.disabled]}
        >
          <Text style={styles.buttonText}>Editar título, descripción y etiquetas</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, borderRadius: 18, padding: 18, backgroundColor: "#ffffff" },
  heading: { fontSize: 17, fontWeight: "700", color: "#20202a" },
  label: { fontSize: 14, fontWeight: "700", color: "#20202a" },
  helper: { fontSize: 13, color: "#686875" },
  input: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#20202a",
    fontSize: 15,
  },
  description: { minHeight: 104 },
  button: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  buttonText: { color: "#24243a", fontSize: 14, fontWeight: "700" },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3446a2",
    borderRadius: 12,
  },
  primaryText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.48 },
  success: { color: "#17643a", fontSize: 14, lineHeight: 20 },
  error: { color: "#9f1d1d", fontSize: 14, lineHeight: 20 },
});
