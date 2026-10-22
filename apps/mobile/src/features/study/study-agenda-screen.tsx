import { Redirect, useIsFocused, useRouter } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect, useMemo, useState } from "react";

import { navigationAuthorityKey } from "@/features/navigation/product-navigation";
import { ProductSurface } from "@/features/navigation/product-surface";
import { useSession } from "@/features/session/session-provider";

import type { StudyAgendaEntry } from "./study-agenda-api";
import { StudyAgendaController } from "./study-agenda-controller";
import { MOBILE_STUDY_AGENDA_VISIBLE } from "./study-agenda-flag";
import { formatStudyAgendaLocalTime } from "./study-agenda-presentation";
import { mobileStudyAgendaApi } from "./study-agenda-runtime";

function AgendaEntry({
  entry,
  scheduled,
}: {
  entry: StudyAgendaEntry;
  scheduled: boolean;
}) {
  return (
    <View style={styles.entry}>
      <Text style={styles.entryTitle}>{entry.title}</Text>
      {scheduled && entry.startsAt ? (
        <Text style={styles.entryTime}>
          {formatStudyAgendaLocalTime(entry.startsAt)} · hora local guardada
        </Text>
      ) : (
        <Text style={styles.entryTime}>Sin horario programado</Text>
      )}
      <Text style={styles.entryMeta}>
        {entry.tasks.completed} de {entry.tasks.total} tareas ·{" "}
        {entry.minutes.remaining} min restantes
      </Text>
    </View>
  );
}

export function MobileStudyAgendaScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const { snapshot: session } = useSession();
  const [appState, setAppState] = useState(AppState.currentState);
  const [refreshKey, setRefreshKey] = useState(0);
  const controller = useMemo(
    () => new StudyAgendaController(mobileStudyAgendaApi),
    [],
  );
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());

  const sessionAuthority =
    session.kind === "authenticated"
      ? navigationAuthorityKey(session.user.id, session.session.id)
      : null;
  const authorityKey =
    focused && appState === "active" ? sessionAuthority : null;

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!authorityKey || !MOBILE_STUDY_AGENDA_VISIBLE) {
      controller.close();
      return;
    }
    void controller.load(authorityKey);
    return () => controller.close();
  }, [authorityKey, controller, refreshKey]);
  useEffect(() => () => controller.dispose(), [controller]);

  const current =
    snapshot.kind !== "idle" && snapshot.authorityKey === authorityKey
      ? snapshot
      : null;
  const refreshing = current?.kind === "loading";
  const refresh = () => setRefreshKey((value) => value + 1);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  };

  if (session.kind !== "authenticated") return <Redirect href="/sign-in" />;

  if (!MOBILE_STUDY_AGENDA_VISIBLE) {
    return (
      <ProductSurface
        title="Agenda de estudio"
        description="Consultá tus sesiones guardadas por materia."
      >
        <View style={styles.card}>
          <Text style={styles.copy}>
            La agenda todavía no está habilitada en esta versión de la app.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={goBack}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryLabel}>Volver</Text>
          </Pressable>
        </View>
      </ProductSurface>
    );
  }

  return (
    <ProductSurface
      title="Agenda de estudio"
      description="Tus sesiones guardadas, agrupadas por horario. Las horas se muestran tal como las guardaste; la agenda no crea recordatorios."
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {current?.kind === "loading" || !current ? (
        <View style={styles.card}>
          <ActivityIndicator accessibilityLabel="Cargando agenda de estudio" />
          <Text style={styles.copy}>Cargando tus sesiones…</Text>
        </View>
      ) : current.kind === "error" ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>
            {current.message}
          </Text>
          {current.retryable ? (
            <Pressable
              accessibilityRole="button"
              disabled={!authorityKey}
              onPress={() => {
                if (authorityKey) void controller.load(authorityKey);
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryLabel}>Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          {!current.agenda.scheduled.length &&
          !current.agenda.unscheduled.length ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Todavía no hay sesiones guardadas
              </Text>
              <Text style={styles.copy}>
                Cuando guardes un plan de estudio, aparecerá acá.
              </Text>
            </View>
          ) : null}
          {current.agenda.scheduled.length ? (
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.cardTitle}>
                Con horario
              </Text>
              {current.agenda.scheduled.map((entry) => (
                <AgendaEntry key={entry.subjectId} entry={entry} scheduled />
              ))}
            </View>
          ) : null}
          {current.agenda.unscheduled.length ? (
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.cardTitle}>
                Sin horario
              </Text>
              {current.agenda.unscheduled.map((entry) => (
                <AgendaEntry
                  key={entry.subjectId}
                  entry={entry}
                  scheduled={false}
                />
              ))}
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir temporizador de estudio"
            onPress={() => router.push("/study-focus")}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryLabel}>Abrir temporizador</Text>
          </Pressable>
        </>
      )}
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderRadius: 18,
    padding: 18,
    backgroundColor: "#ffffff",
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#20202a" },
  copy: { fontSize: 15, lineHeight: 22, color: "#5b5b66" },
  error: { color: "#9f1d1d", fontSize: 15, lineHeight: 22 },
  entry: {
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e2e8",
    paddingTop: 10,
  },
  entryTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    color: "#24243a",
  },
  entryTime: { fontSize: 14, lineHeight: 20, color: "#43366a" },
  entryMeta: { fontSize: 13, lineHeight: 19, color: "#5b5b66" },
  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c9c9d2",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  secondaryLabel: { color: "#24243a", fontSize: 15, fontWeight: "700" },
});
