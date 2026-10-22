import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { QaActivityCalendar } from "./qa-activity-calendar-api";
import {
  QaActivityCalendarController,
  type QaActivityCalendarSnapshot,
} from "./qa-activity-calendar-controller";
import {
  qaActivityCalendarCells,
  qaActivityCalendarSummary,
  qaActivityIntensity,
} from "./qa-activity-calendar-presentation";
import { mobileQaActivityCalendarApi } from "./qa-activity-calendar-runtime";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function QaActivityCalendarCard({
  authorityKey,
  active,
  refreshToken,
}: {
  authorityKey: string | null;
  active: boolean;
  refreshToken: number;
}) {
  const controller = useMemo(
    () => new QaActivityCalendarController(mobileQaActivityCalendarApi),
    [],
  );
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => {
    if (!authorityKey || !active) {
      controller.close();
      return;
    }
    void controller.load(authorityKey);
    return () => controller.close();
  }, [active, authorityKey, controller, refreshToken]);
  useEffect(() => () => controller.dispose(), [controller]);

  const current =
    active && snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        Actividad en Q&A
      </Text>
      <Text style={styles.copy}>
        Participación visible en los últimos 28 días, agrupada por fecha UTC. No
        representa asistencia, resultados ni rachas.
      </Text>
      {!current || current.kind === "loading" ? (
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel="Cargando actividad en Q&A" />
          <Text style={styles.copy}>Cargando actividad…</Text>
        </View>
      ) : current.kind === "error" ? (
        <View style={styles.loading}>
          <Text accessibilityRole="alert" style={styles.error}>
            {current.message}
          </Text>
          {current.retryable ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (authorityKey) void controller.load(authorityKey);
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryLabel}>Reintentar calendario</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <CalendarSummary calendar={current.calendar} />
      )}
    </View>
  );
}

function CalendarSummary({ calendar }: { calendar: QaActivityCalendar }) {
  const summary = qaActivityCalendarSummary(calendar);
  const cells = qaActivityCalendarCells(calendar);
  return (
    <View style={styles.summary}>
      {summary.activeDays === 0 ? (
        <Text style={styles.copy}>
          No hay participación visible en este período. Cuando hagas preguntas o
          respondas, vas a verla acá.
        </Text>
      ) : (
        <Text style={styles.copy}>
          {summary.questions}{" "}
          {summary.questions === 1 ? "pregunta" : "preguntas"}
          {" y "}
          {summary.answers} {summary.answers === 1 ? "respuesta" : "respuestas"}
          {" visibles en "}
          {summary.activeDays} {summary.activeDays === 1 ? "día" : "días"}.
        </Text>
      )}
      <View style={styles.weekdays}>
        {WEEKDAYS.map((weekday, index) => (
          <Text key={weekday + index} style={styles.weekday}>
            {weekday}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell) =>
          cell.kind === "spacer" ? (
            <View key={cell.key} style={styles.cell} />
          ) : (
            <View
              accessible
              accessibilityLabel={
                cell.day.dateUtc +
                "; " +
                cell.day.total +
                " aportes Q&A visibles; " +
                cell.day.questions +
                " preguntas; " +
                cell.day.answers +
                " respuestas"
              }
              key={cell.key}
              style={[
                styles.cell,
                intensityStyles[qaActivityIntensity(cell.day.total)],
              ]}
            >
              <Text style={styles.dayNumber}>{cell.dayNumber}</Text>
            </View>
          ),
        )}
      </View>
      <View style={styles.legend}>
        {[
          { level: 0, label: "0" },
          { level: 1, label: "1" },
          { level: 2, label: "2–3" },
          { level: 3, label: "4+" },
        ].map(({ level, label }) => (
          <View key={level} style={styles.legendItem}>
            <View
              style={[
                styles.legendSwatch,
                intensityStyles[level as 0 | 1 | 2 | 3],
              ]}
            />
            <Text style={styles.legendLabel}>{label}</Text>
          </View>
        ))}
        <Text style={styles.legendNote}>aportes por día</Text>
      </View>
    </View>
  );
}

const intensityStyles = StyleSheet.create({
  0: { backgroundColor: "#eef0f6", borderColor: "#d8dbe5" },
  1: { backgroundColor: "#c5cbed", borderColor: "#aeb7e2" },
  2: { backgroundColor: "#8290d0", borderColor: "#7180c2" },
  3: { backgroundColor: "#394d9e", borderColor: "#394d9e" },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e1e8",
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  title: { color: "#252541", fontSize: 17, fontWeight: "700" },
  copy: { color: "#585866", fontSize: 14, lineHeight: 21 },
  loading: { alignItems: "flex-start", gap: 10 },
  error: { color: "#9f1d1d", fontSize: 14, lineHeight: 21 },
  retryButton: {
    alignItems: "center",
    borderColor: "#c9c9d2",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  retryLabel: { color: "#24243a", fontSize: 14, fontWeight: "700" },
  summary: { gap: 12 },
  weekdays: { flexDirection: "row", gap: 4 },
  weekday: {
    color: "#626278",
    fontSize: 12,
    textAlign: "center",
    width: 30,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  cell: {
    alignItems: "center",
    borderColor: "#d8dbe5",
    borderRadius: 6,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  dayNumber: { color: "#252541", fontSize: 10, fontWeight: "600" },
  legend: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 4 },
  legendSwatch: { borderRadius: 4, borderWidth: 1, height: 13, width: 13 },
  legendLabel: { color: "#626278", fontSize: 12 },
  legendNote: { color: "#626278", fontSize: 12 },
});
