import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useMemo, useState } from "react";

import type { MobileOrganizationsFailure } from "./organizations-controller";
import {
  MobileOrganizationReportController,
  type OrganizationReportTargetType,
} from "./organization-report-controller";
import {
  ORGANIZATION_REPORT_REASONS,
  validateOrganizationReport,
  type OrganizationReportReason,
} from "./organization-report-policy";
import { mobileOrganizationsApi } from "./organizations-runtime";

function targetLabel(targetType: OrganizationReportTargetType): string {
  return targetType === "post" ? "publicación" : "evento";
}

function reasonLabel(reason: OrganizationReportReason | null): string {
  return (
    ORGANIZATION_REPORT_REASONS.find((option) => option.value === reason)
      ?.label ?? "Otro motivo"
  );
}

function failureMessage(failure: MobileOrganizationsFailure): string {
  if (failure.kind === "offline") {
    return "No hay conexión. Podés volver a intentar cuando estés en línea.";
  }
  if (failure.kind === "auth_required") {
    return "La sesión cambió. Iniciá sesión nuevamente.";
  }
  if (failure.kind === "restricted") {
    return "La cuenta no puede reportar este contenido.";
  }
  return "No pudimos enviar el reporte. Podés corregirlo o intentar de nuevo.";
}

export function OrganizationReportAction({
  authorityKey,
  organizationId,
  targetType,
  targetId,
}: {
  authorityKey: string;
  organizationId: string;
  targetType: OrganizationReportTargetType;
  targetId: string;
}) {
  const label = targetLabel(targetType);
  const controller = useMemo(
    () => new MobileOrganizationReportController(mobileOrganizationsApi),
    [],
  );
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState<OrganizationReportReason | null>(null);
  const [details, setDetails] = useState("");

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => {
    controller.setTarget(authorityKey, organizationId, targetType, targetId);
    return () => controller.invalidate(authorityKey);
  }, [authorityKey, controller, organizationId, targetId, targetType]);

  const current =
    snapshot.kind === "ready" &&
    snapshot.authorityKey === authorityKey &&
    snapshot.organizationId === organizationId &&
    snapshot.targetType === targetType &&
    snapshot.targetId === targetId
      ? snapshot
      : null;
  const validation = reason
    ? validateOrganizationReport(reason, details)
    : { kind: "invalid" as const, message: "Elegí el motivo del reporte." };
  const invalidDetails =
    details.trim().length > 0 &&
    (details.trim().length < 3 || details.trim().length > 1500);

  if (current?.outcome === "confirmed") {
    return (
      <View style={styles.card}>
        <Text accessibilityLiveRegion="polite" style={styles.success}>
          Recibimos el reporte. Quedó pendiente de revisión.
        </Text>
        <Text style={styles.copy}>
          Motivo registrado: {reasonLabel(current.reason)}.
        </Text>
      </View>
    );
  }

  if (current?.outcome === "uncertain") {
    return (
      <View style={styles.card}>
        <Text accessibilityRole="alert" style={styles.error}>
          No pudimos confirmar si el reporte se registró. No lo vuelvas a
          enviar; el servidor podría haberlo recibido.
        </Text>
      </View>
    );
  }

  if (!expanded) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={"Reportar " + label}
        accessibilityState={{ disabled: false }}
        onPress={() => setExpanded(true)}
        style={styles.action}
      >
        <Text style={styles.actionText}>Reportar {label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        Reportar {label}
      </Text>
      <Text style={styles.copy}>
        Elegí el motivo que mejor describe el problema.
      </Text>

      <View accessibilityRole="radiogroup" style={styles.reasonList}>
        {ORGANIZATION_REPORT_REASONS.map((option) => {
          const checked = reason === option.value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{
                checked,
                disabled: current?.sending ?? false,
              }}
              disabled={current?.sending ?? false}
              key={option.value}
              onPress={() => setReason(option.value)}
              style={[
                styles.reasonOption,
                checked ? styles.reasonSelected : null,
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
        editable={!(current?.sending ?? false)}
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
          {failureMessage(current.failure)}
        </Text>
      ) : null}
      {current?.sending ? (
        <View style={styles.progress}>
          <ActivityIndicator accessibilityLabel="Enviando reporte" />
          <Text style={styles.copy}>Enviando reporte…</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={"Enviar reporte de " + label}
        accessibilityState={{
          disabled: validation.kind !== "valid" || (current?.sending ?? false),
        }}
        disabled={validation.kind !== "valid" || (current?.sending ?? false)}
        onPress={() => {
          if (validation.kind === "valid") {
            void controller.submit(
              authorityKey,
              organizationId,
              targetType,
              targetId,
              validation.input,
            );
          }
        }}
        style={styles.submit}
      >
        <Text style={styles.submitText}>
          {current?.failure ? "Reintentar envío" : "Enviar reporte"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancelar el reporte"
        accessibilityState={{ disabled: current?.sending ?? false }}
        disabled={current?.sending ?? false}
        onPress={() => setExpanded(false)}
        style={styles.cancel}
      >
        <Text style={styles.cancelText}>Cancelar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9cad4",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  actionText: {
    color: "#383844",
    fontSize: 13,
    fontWeight: "700",
  },
  card: {
    gap: 10,
    borderRadius: 12,
    padding: 12,
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
  input: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: "#cfcfd8",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#ffffff",
    color: "#20202a",
  },
  progress: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  error: {
    color: "#8b1e1e",
    fontSize: 13,
    lineHeight: 19,
  },
  success: {
    color: "#17643a",
    fontSize: 13,
    lineHeight: 19,
  },
  submit: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: "#43366a",
  },
  submitText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  cancel: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: "#383844",
    fontSize: 14,
    fontWeight: "700",
  },
});
