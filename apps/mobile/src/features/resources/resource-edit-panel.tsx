import type { ResourceView, ResourceVisibility } from "@losapuntes/contracts";
import { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { mobileResourceEditApi } from "./resource-runtime";
import {
  MobileResourceEditController,
  type ResourceEditFailure,
  type ResourceEditSnapshot,
} from "./resource-edit-controller";
import {
  resourceEditDraft,
  validateResourceEdit,
  RESOURCE_EDIT_DESCRIPTION_MAX,
  RESOURCE_EDIT_TITLE_MAX,
  type ResourceEditDraft,
} from "./resource-edit-policy";

const failures: Record<ResourceEditFailure, string> = {
  offline: "No hay conexión. Actualizá el recurso antes de editar otra vez.",
  timeout: "Se agotó el tiempo de respuesta. Actualizá el recurso.",
  server_unavailable: "El servidor no está disponible. Actualizá antes de reintentar.",
  forbidden: "No tenés autorización para editar este recurso.",
  restricted: "Tu cuenta no puede editar recursos.",
  validation: "El servidor rechazó el cambio. Revisá los datos.",
  error: "No se pudieron guardar los cambios.",
};

const visibilityOptions: Array<{
  value: ResourceVisibility;
  label: string;
  help: string;
}> = [
  { value: "private", label: "Privado", help: "Solo vos" },
  {
    value: "shared",
    label: "Compartido",
    help: "Solo personas con permiso explícito",
  },
  { value: "public", label: "Público", help: "Visible para la comunidad" },
];

export function ResourceEditPanel({
  resource,
  authorityKey,
  onRefresh,
}: {
  resource: ResourceView;
  authorityKey: string | null;
  onRefresh: () => void;
}) {
  const controller = useMemo(
    () => new MobileResourceEditController(mobileResourceEditApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<ResourceEditSnapshot>(
    controller.getSnapshot(),
  );
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<ResourceEditDraft>(
    resourceEditDraft(resource),
  );

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    if (!authorityKey) return;
    controller.setScope(authorityKey, resource);
    return () => controller.suspend(authorityKey);
  }, [authorityKey, controller, resource.id]);

  const current =
    snapshot.kind === "ready" &&
    snapshot.authorityKey === authorityKey &&
    snapshot.resource.id === resource.id
      ? snapshot
      : null;
  const source = current?.resource ?? resource;
  const validation = validateResourceEdit(source, draft);
  const blocked =
    !current ||
    current.sending ||
    current.outcome === "conflict" ||
    current.outcome === "uncertain";

  const startEditing = () => {
    setDraft(resourceEditDraft(source));
    setExpanded(true);
  };

  const submit = async () => {
    if (!authorityKey || !current || validation.kind !== "valid" || blocked) {
      return;
    }
    const updated = await controller.submit(authorityKey, resource.id, draft);
    if (!updated) return;
    setExpanded(false);
    setDraft(resourceEditDraft(updated));
    AccessibilityInfo.announceForAccessibility("Los cambios se guardaron.");
    onRefresh();
  };

  // Editing is an owner capability resolved by the API, not a client-side guess.
  if (!resource.capabilities.edit) return null;

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Editar mi apunte
      </Text>
      {!expanded ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Editar ${resource.title}`}
          disabled={!current}
          onPress={startEditing}
          style={[styles.secondaryButton, !current && styles.disabled]}
        >
          <Text style={styles.secondaryText}>Editar información</Text>
        </Pressable>
      ) : (
        <>
          <Text style={styles.helper}>
            Podés cambiar título, descripción, etiquetas y visibilidad. El
            archivo y la materia se mantienen.
          </Text>

          <Text style={styles.label}>Título</Text>
          <TextInput
            accessibilityLabel="Título del apunte"
            maxLength={RESOURCE_EDIT_TITLE_MAX}
            onChangeText={(title) => setDraft((old) => ({ ...old, title }))}
            editable={!blocked}
            style={styles.input}
            value={draft.title}
          />

          <Text style={styles.label}>Descripción (opcional)</Text>
          <TextInput
            accessibilityLabel="Descripción del apunte"
            maxLength={RESOURCE_EDIT_DESCRIPTION_MAX}
            multiline
            onChangeText={(description) =>
              setDraft((old) => ({ ...old, description }))
            }
            editable={!blocked}
            style={[styles.input, styles.descriptionInput]}
            textAlignVertical="top"
            value={draft.description}
          />

          <Text style={styles.label}>Etiquetas separadas por coma</Text>
          <TextInput
            accessibilityLabel="Etiquetas del apunte"
            maxLength={600}
            onChangeText={(tagsText) =>
              setDraft((old) => ({ ...old, tagsText }))
            }
            editable={!blocked}
            placeholder="parcial, resumen, práctica"
            style={styles.input}
            value={draft.tagsText}
          />

          <Text style={styles.label}>Visibilidad</Text>
          <View accessibilityRole="radiogroup" style={styles.visibilityGroup}>
            {visibilityOptions.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityHint={option.help}
                accessibilityState={{
                  checked: draft.visibility === option.value,
                  disabled: blocked,
                }}
                disabled={blocked}
                onPress={() =>
                  setDraft((old) => ({ ...old, visibility: option.value }))
                }
                style={[
                  styles.visibilityButton,
                  draft.visibility === option.value &&
                    styles.visibilitySelected,
                ]}
              >
                <Text style={styles.visibilityLabel}>{option.label}</Text>
                <Text style={styles.helper}>{option.help}</Text>
              </Pressable>
            ))}
          </View>
          {draft.visibility === "shared" ? (
            <Text style={styles.helper}>
              Los permisos individuales para compartir se administran desde
              la versión Web.
            </Text>
          ) : null}

          {validation.kind === "invalid" ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {validation.message}
            </Text>
          ) : validation.kind === "unchanged" ? (
            <Text style={styles.helper}>No hay cambios para guardar.</Text>
          ) : null}

          {current?.outcome === "conflict" ? (
            <Text accessibilityRole="alert" style={styles.error}>
              Otra edición modificó este apunte. Actualizá el recurso antes de
              volver a editar. Los cambios del formulario se descartarán.
            </Text>
          ) : null}
          {current?.outcome === "uncertain" ? (
            <Text accessibilityRole="alert" style={styles.error}>
              No pudimos confirmar si se guardó. Actualizá el recurso para
              conocer la última versión antes de editar nuevamente.
            </Text>
          ) : null}
          {current?.failure && current.outcome === "none" ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {failures[current.failure]}
            </Text>
          ) : null}

          {current?.outcome === "conflict" ||
          current?.outcome === "uncertain" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Actualizar recurso desde el servidor"
              onPress={onRefresh}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryText}>Actualizar recurso</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Guardar cambios del apunte"
              disabled={blocked || validation.kind !== "valid"}
              onPress={() => void submit()}
              style={[
                styles.primaryButton,
                (blocked || validation.kind !== "valid") && styles.disabled,
              ]}
            >
              {current?.sending ? (
                <ActivityIndicator accessibilityLabel="Guardando cambios" />
              ) : (
                <Text style={styles.primaryText}>Guardar cambios</Text>
              )}
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar edición del apunte"
            disabled={current?.sending}
            onPress={() => {
              setExpanded(false);
              setDraft(resourceEditDraft(source));
            }}
            style={[styles.secondaryButton, current?.sending && styles.disabled]}
          >
            <Text style={styles.secondaryText}>Cancelar</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  heading: {
    fontSize: 17,
    fontWeight: "700",
    color: "#20202a",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#20202a",
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
    color: "#656570",
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#20202a",
  },
  descriptionInput: { minHeight: 100 },
  visibilityGroup: { gap: 8 },
  visibilityButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 10,
    padding: 10,
    gap: 3,
  },
  visibilitySelected: {
    borderColor: "#43366a",
    backgroundColor: "#f1eff8",
  },
  visibilityLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#20202a",
  },
  primaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#3446a2",
  },
  primaryText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
  },
  secondaryText: { color: "#24243a", fontWeight: "700", fontSize: 14 },
  disabled: { opacity: 0.5 },
  error: { color: "#9f1d1d", fontSize: 14, lineHeight: 20 },
});
