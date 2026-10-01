import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type {
  AcademicAffiliation,
  AcademicAffiliationStatus,
} from "@losapuntes/contracts";

import { useAcademicContext } from "./academic-context-provider";

const statusLabels: Record<AcademicAffiliationStatus, string> = {
  applicant: "Postulación",
  active: "Activa",
  paused: "Pausada",
  completed: "Completada",
  withdrawn: "Retirada",
  alumni: "Alumni",
};

const affiliationLabel = (affiliation: AcademicAffiliation): string => {
  const scope = affiliation.programId
    ? "Carrera"
    : affiliation.academicUnitId
      ? "Unidad académica"
      : affiliation.campusId
        ? "Campus"
        : "Institución";
  const period = affiliation.startedOn
    ? affiliation.endedOn
      ? `${affiliation.startedOn}–${affiliation.endedOn}`
      : `desde ${affiliation.startedOn}`
    : null;

  return [scope, statusLabels[affiliation.status], period]
    .filter(Boolean)
    .join(" · ");
};

const failureCopy = {
  offline: "No pudimos revalidar tu contexto porque no hay conexión.",
  timeout: "La revalidación del contexto tardó demasiado.",
  server_unavailable: "El servicio académico no está disponible ahora.",
  error: "No pudimos validar tu contexto académico.",
} as const;

export function AcademicContextCard() {
  const { snapshot, retry, selectAffiliation } = useAcademicContext();

  if (snapshot.kind === "unavailable" || snapshot.kind === "loading") {
    return (
      <View style={styles.card}>
        <View style={styles.inline}>
          <ActivityIndicator accessibilityLabel="Validando contexto académico" />
          <Text style={styles.copy}>Validando tu contexto académico…</Text>
        </View>
      </View>
    );
  }

  if (
    snapshot.kind === "offline" ||
    snapshot.kind === "timeout" ||
    snapshot.kind === "server_unavailable" ||
    snapshot.kind === "error"
  ) {
    return (
      <View style={styles.card}>
        <Text accessibilityRole="alert" style={styles.error}>
          {failureCopy[snapshot.kind]}
        </Text>
        <Text style={styles.copy}>
          No mostramos un contexto anterior como vigente hasta volver a
          consultarlo con el servidor.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void retry()}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  const { data } = snapshot;
  const currentAffiliation = data.context
    ? (data.affiliations.find(
        (item) => item.id === data.context?.affiliationId,
      ) ?? null)
    : null;
  const currentParticipation = data.context?.subjectParticipationId
    ? (data.participations.find(
        (item) => item.id === data.context?.subjectParticipationId,
      ) ?? null)
    : null;
  const eligible = data.affiliations.filter(
    (item) => item.status !== "withdrawn",
  );

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Contexto académico</Text>

      {data.context && currentAffiliation ? (
        <View style={styles.current}>
          <Text style={styles.currentLabel}>Contexto validado</Text>
          <Text style={styles.currentValue}>
            {affiliationLabel(currentAffiliation)}
          </Text>
          {currentParticipation ? (
            <Text style={styles.copy}>
              Materia actual
              {currentParticipation.periodLabel
                ? ` · ${currentParticipation.periodLabel}`
                : ""}
            </Text>
          ) : (
            <Text style={styles.copy}>
              Sin materia actual fijada para esta afiliación.
            </Text>
          )}
        </View>
      ) : data.context ? (
        <Text accessibilityRole="alert" style={styles.error}>
          El servidor devolvió un contexto fuera del inventario visible. No lo
          reemplazamos por una suposición local.
        </Text>
      ) : (
        <Text style={styles.copy}>
          Todavía no elegiste un contexto actual. Podés empezar por una de tus
          afiliaciones existentes.
        </Text>
      )}

      {data.affiliationsTruncated ? (
        <Text accessibilityRole="alert" style={styles.warning}>
          Mostramos hasta {data.affiliationLimit} afiliaciones. La lista no es
          completa.
        </Text>
      ) : null}

      {data.participationsTruncated ? (
        <Text accessibilityRole="alert" style={styles.warning}>
          Mostramos hasta {data.participationLimit} participaciones. La lista no
          es completa.
        </Text>
      ) : null}

      {eligible.length === 0 ? (
        <Text style={styles.copy}>
          No hay una afiliación elegible en el inventario visible. El alta y la
          búsqueda del Grafo Académico llegan en el siguiente tramo de
          onboarding.
        </Text>
      ) : (
        <View style={styles.options}>
          <Text style={styles.sectionLabel}>Cambiar afiliación</Text>
          {eligible.map((affiliation) => {
            const selected = data.context?.affiliationId === affiliation.id;
            return (
              <Pressable
                key={affiliation.id}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: snapshot.kind === "switching",
                  selected,
                }}
                disabled={snapshot.kind === "switching" || selected}
                onPress={() => void selectAffiliation(affiliation.id)}
                style={[
                  styles.option,
                  selected ? styles.optionSelected : null,
                ]}
              >
                <Text style={styles.optionTitle}>
                  {affiliationLabel(affiliation)}
                </Text>
                <Text style={styles.optionCopy}>
                  {selected
                    ? "Contexto actual"
                    : "Usar esta afiliación y revalidar en el servidor"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {snapshot.kind === "switching" ? (
        <View style={styles.inline}>
          <ActivityIndicator accessibilityLabel="Cambiando contexto académico" />
          <Text style={styles.copy}>Revalidando el cambio…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#20202a",
  },
  copy: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5b5b66",
  },
  current: {
    gap: 6,
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#f2f2f7",
  },
  currentLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#55555f",
    textTransform: "uppercase",
  },
  currentValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#20202a",
  },
  warning: {
    fontSize: 14,
    lineHeight: 20,
    color: "#765b00",
  },
  error: {
    fontSize: 14,
    lineHeight: 20,
    color: "#9f1d1d",
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  options: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#3c3c47",
  },
  option: {
    minHeight: 54,
    gap: 4,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d6d6df",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionSelected: {
    borderColor: "#24243a",
    backgroundColor: "#f2f2f7",
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#20202a",
  },
  optionCopy: {
    fontSize: 13,
    lineHeight: 18,
    color: "#5b5b66",
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#24243a",
  },
});
