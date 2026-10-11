import type {
  CreateQaReportInput,
  QaReportReason,
  QaReportTargetType,
} from "@losapuntes/contracts/social-qa";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useMemo, useState } from "react";

import type { CommunityFailure } from "./community-controller";
import { mobileCommunityApi } from "./community-runtime";
import {
  normalizeQaReportInput,
  QaReportController,
  type QaReportSnapshot,
} from "./qa-report-controller";

const reportReasons: Array<{ value: QaReportReason; label: string }> = [
  { value: "spam", label: "Spam o contenido repetido" },
  { value: "plagiarism", label: "Plagio" },
  { value: "harassment", label: "Acoso" },
  { value: "misinformation", label: "Información falsa" },
  { value: "inappropriate", label: "Contenido inapropiado" },
  { value: "other", label: "Otro motivo" },
];

function reasonLabel(reason: QaReportReason): string {
  return (
    reportReasons.find((item) => item.value === reason)?.label ?? "Otro motivo"
  );
}

function failureCopy(failure: CommunityFailure): string {
  switch (failure.kind) {
    case "offline":
      return "No hay conexión. Podés volver a intentar cuando estés en línea.";
    case "timeout":
      return "No pudimos confirmar el reporte. Podés volver a enviarlo.";
    case "server_unavailable":
      return "El servicio de reportes no está disponible ahora.";
    case "auth_required":
      return "La sesión venció. Iniciá sesión para continuar.";
    case "restricted":
      return "La cuenta no puede reportar este contenido.";
    default:
      return "No pudimos enviar el reporte. Podés volver a intentar.";
  }
}

function targetLabel(targetType: QaReportTargetType): string {
  return targetType === "question" ? "pregunta" : "respuesta";
}

export function QaReportAction({
  authorityKey,
  targetType,
  targetId,
}: {
  authorityKey: string;
  targetType: QaReportTargetType;
  targetId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState<QaReportReason | null>(null);
  const [details, setDetails] = useState("");
  const controller = useMemo(
    () => new QaReportController(mobileCommunityApi),
    [],
  );
  const [snapshot, setSnapshot] = useState<QaReportSnapshot>(
    controller.getSnapshot(),
  );

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => {
    controller.setAuthority(authorityKey, targetType, targetId);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, controller, targetId, targetType]);

  const current =
    snapshot.kind === "ready" &&
    snapshot.authorityKey === authorityKey &&
    snapshot.targetType === targetType &&
    snapshot.targetId === targetId
      ? snapshot
      : null;
  const normalizedInput: CreateQaReportInput | null = reason
    ? normalizeQaReportInput({ reason, ...(details ? { details } : {}) })
    : null;
  const invalidDetails =
    details.trim().length > 0 &&
    (details.trim().length < 3 || details.trim().length > 1500);
  const report = current?.report ?? null;

  if (report) {
    return (
      <View style={styles.card}>
        <Text accessibilityLiveRegion="polite" style={styles.success}>
          {report.status === "pending"
            ? "El reporte quedó pendiente de revisión."
            : "El servidor confirmó el estado del reporte."}
        </Text>
        <Text style={styles.copy}>
          Motivo registrado: {reasonLabel(report.reason)}.
        </Text>
      </View>
    );
  }

  if (!expanded) {
    return (
      <ActionButton
        label={`Reportar ${targetLabel(targetType)}`}
        accessibilityLabel={`Reportar ${targetLabel(targetType)}`}
        disabled={false}
        secondary
        onPress={() => setExpanded(true)}
      />
    );
  }

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        Reportar {targetLabel(targetType)}
      </Text>
      <Text style={styles.copy}>
        Elegí el motivo que mejor describe el problema.
      </Text>

      <View style={styles.reasonList}>
        {reportReasons.map((option) => {
          const checked = reason === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked, disabled: current?.busy ?? false }}
              disabled={current?.busy ?? false}
              onPress={() => setReason(option.value)}
              style={({ pressed }) => [
                styles.reasonOption,
                checked ? styles.reasonSelected : null,
                pressed && !current?.busy ? styles.reasonPressed : null,
              ]}
            >
              <Text style={checked ? styles.reasonSelectedLabel : styles.copy}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        accessibilityLabel="Detalles opcionales del reporte"
        editable={!(current?.busy ?? false)}
        maxLength={1500}
        multiline
        onChangeText={setDetails}
        placeholder="Detalles opcionales"
        style={styles.input}
        textAlignVertical="top"
        value={details}
      />
      <Text style={styles.meta}>{details.length}/1500 caracteres</Text>
      {invalidDetails ? (
        <Text accessibilityRole="alert" style={styles.error}>
          El detalle debe tener al menos 3 caracteres o quedar vacío.
        </Text>
      ) : null}
      {!reason ? (
        <Text style={styles.meta}>Elegí un motivo para continuar.</Text>
      ) : null}
      {current?.failure ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {failureCopy(current.failure)}
        </Text>
      ) : null}
      {current?.busy ? (
        <View style={styles.progress}>
          <ActivityIndicator accessibilityLabel="Enviando reporte" />
          <Text style={styles.copy}>Enviando reporte…</Text>
        </View>
      ) : null}

      <ActionButton
        label={current?.failure ? "Reintentar envío" : "Enviar reporte"}
        accessibilityLabel={`Enviar reporte de ${targetLabel(targetType)}`}
        disabled={
          !normalizedInput || invalidDetails || (current?.busy ?? false)
        }
        onPress={() => {
          if (normalizedInput) {
            void controller.submit(authorityKey, normalizedInput);
          }
        }}
      />
      <ActionButton
        label="Cancelar"
        accessibilityLabel="Cancelar el reporte"
        disabled={current?.busy ?? false}
        secondary
        onPress={() => setExpanded(false)}
      />
    </View>
  );
}

function ActionButton({
  label,
  accessibilityLabel,
  disabled,
  secondary = false,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  secondary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondaryButton : null,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text style={secondary ? styles.secondaryLabel : styles.buttonLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#f8f7fb",
  },
  title: {
    color: "#20202a",
    fontSize: 15,
    fontWeight: "800",
  },
  copy: {
    color: "#55555f",
    fontSize: 14,
    lineHeight: 21,
  },
  meta: {
    color: "#6c6a75",
    fontSize: 12,
    lineHeight: 18,
  },
  reasonList: {
    gap: 8,
  },
  reasonOption: {
    minHeight: 42,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#dedce6",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
  },
  reasonSelected: {
    borderColor: "#43366a",
    backgroundColor: "#f0edf8",
  },
  reasonSelectedLabel: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  reasonPressed: {
    opacity: 0.75,
  },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: "#d9d7e2",
    borderRadius: 10,
    padding: 12,
    color: "#20202a",
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: "#ffffff",
  },
  error: {
    color: "#9f1d1d",
    fontSize: 13,
    lineHeight: 20,
  },
  success: {
    color: "#17613d",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  progress: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  button: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#43366a",
    paddingHorizontal: 12,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#d9d7e2",
    backgroundColor: "#ffffff",
  },
  buttonLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryLabel: {
    color: "#43366a",
    fontSize: 14,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
