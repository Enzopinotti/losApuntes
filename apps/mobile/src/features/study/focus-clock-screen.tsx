import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useIsFocused, useRouter } from "expo-router";

import { ProductSurface } from "@/features/navigation/product-surface";

import {
  advanceFocusClock,
  createFocusClock,
  formatFocusRemaining,
  pauseFocusClock,
  resetFocusClock,
  selectFocusMode,
  startFocusClock,
  type FocusClock,
  type FocusMode,
} from "./focus-clock";

export function MobileStudyFocusScreen({
  initialStudyMinutes = 25,
}: {
  initialStudyMinutes?: number;
}) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  const [clock, setClock] = useState<FocusClock>(() =>
    createFocusClock("study", initialStudyMinutes),
  );
  const [completionAcknowledged, setCompletionAcknowledged] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isFocused) return;
    setClock((current) =>
      current.phase === "idle" ? current : resetFocusClock(current),
    );
    setCompletionAcknowledged(false);
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused) return;
    setClock((current) =>
      current.phase === "idle"
        ? createFocusClock("study", initialStudyMinutes)
        : current,
    );
  }, [initialStudyMinutes, isFocused]);

  useEffect(() => {
    if (!isFocused || appState !== "active" || clock.phase !== "running") {
      return;
    }

    const reconcile = () => {
      setClock((current) => advanceFocusClock(current, Date.now()));
    };
    reconcile();
    const intervalId = setInterval(reconcile, 1000);
    return () => clearInterval(intervalId);
  }, [appState, clock.phase, isFocused]);

  useEffect(() => {
    if (
      clock.phase === "done" &&
      !completionAcknowledged &&
      isFocused &&
      appState === "active"
    ) {
      AccessibilityInfo.announceForAccessibility(
        "Intervalo terminado. Elegí si querés descansar o continuar.",
      );
    }
  }, [appState, clock.phase, completionAcknowledged, isFocused]);

  const start = () => {
    setCompletionAcknowledged(false);
    setClock((current) => startFocusClock(current, Date.now()));
  };
  const pause = () => {
    setClock((current) => pauseFocusClock(current, Date.now()));
  };
  const reset = () => {
    setCompletionAcknowledged(false);
    setClock((current) => resetFocusClock(current));
  };
  const select = (mode: FocusMode) => {
    setCompletionAcknowledged(false);
    setClock(selectFocusMode(mode, initialStudyMinutes));
  };
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/home");
    }
  };

  const done = clock.phase === "done";
  const phaseText =
    clock.phase === "running"
      ? "En marcha"
      : clock.phase === "paused"
        ? "En pausa"
        : done
          ? "Finalizado"
          : "Listo para empezar";
  const phaseLabel = clock.mode === "study" ? "Estudiar" : "Descansar";

  return (
    <ProductSurface
      title="Tiempo para concentrarte"
      description="Elegí un intervalo breve de estudio o descanso. El contador es voluntario y sólo vive mientras esta pantalla está abierta."
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver al inicio"
        onPress={goBack}
        style={styles.backButton}
      >
        <Text style={styles.backLabel}>Volver</Text>
      </Pressable>

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.heading}>
          Elegí un intervalo
        </Text>
        <View style={styles.modes}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Estudiar durante ${clock.mode === "study" ? clock.durationMs / 60_000 : initialStudyMinutes} minutos`}
            accessibilityState={{
              selected: clock.mode === "study",
              disabled: clock.phase === "running",
            }}
            disabled={clock.phase === "running"}
            onPress={() => select("study")}
            style={[
              styles.modeButton,
              clock.mode === "study" && styles.modeSelected,
              clock.phase === "running" && styles.disabled,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                clock.mode === "study" && styles.modeTextSelected,
              ]}
            >
              Estudiar ·{" "}
              {clock.mode === "study"
                ? clock.durationMs / 60_000
                : initialStudyMinutes}{" "}
              min
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Descansar durante 5 minutos"
            accessibilityState={{
              selected: clock.mode === "rest",
              disabled: clock.phase === "running",
            }}
            disabled={clock.phase === "running"}
            onPress={() => select("rest")}
            style={[
              styles.modeButton,
              clock.mode === "rest" && styles.modeSelected,
              clock.phase === "running" && styles.disabled,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                clock.mode === "rest" && styles.modeTextSelected,
              ]}
            >
              Descansar · 5 min
            </Text>
          </Pressable>
        </View>

        <View style={styles.readout}>
          <Text
            accessibilityLabel={`Tiempo restante: ${formatFocusRemaining(clock.remainingMs)}`}
            accessibilityLiveRegion="none"
            style={styles.time}
          >
            {formatFocusRemaining(clock.remainingMs)}
          </Text>
          <Text style={styles.phase}>
            {phaseLabel} · {phaseText}
          </Text>
        </View>

        {done && !completionAcknowledged ? (
          <Text accessibilityRole="alert" style={styles.complete}>
            Intervalo terminado. Elegí si querés descansar o continuar. No
            iniciamos otro automáticamente.
          </Text>
        ) : null}

        <View style={styles.controls}>
          {clock.phase === "running" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pausar intervalo"
              onPress={pause}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryText}>Pausar</Text>
            </Pressable>
          ) : !done ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                clock.phase === "paused"
                  ? "Reanudar intervalo"
                  : "Iniciar intervalo"
              }
              onPress={start}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryText}>
                {clock.phase === "paused" ? "Reanudar" : "Iniciar"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Entendido"
              disabled={completionAcknowledged}
              onPress={() => setCompletionAcknowledged(true)}
              style={[
                styles.primaryButton,
                completionAcknowledged && styles.disabled,
              ]}
            >
              <Text style={styles.primaryText}>Entendido</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reiniciar intervalo"
            onPress={reset}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryText}>Reiniciar</Text>
          </Pressable>
        </View>

        <Text style={styles.help}>
          No registramos ni sincronizamos el tiempo. Al salir de esta pantalla,
          el intervalo se descarta; no hay rachas, avisos ni inicio automático.
        </Text>
      </View>
    </ProductSurface>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: "flex-start",
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  backLabel: { color: "#2f4264", fontSize: 15, fontWeight: "700" },
  card: {
    backgroundColor: "#f7f8ff",
    borderColor: "#d6d9ed",
    borderRadius: 18,
    borderWidth: 1,
    gap: 18,
    padding: 18,
  },
  heading: { color: "#262a4c", fontSize: 18, fontWeight: "700" },
  modes: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  modeButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#7d82ac",
    borderRadius: 10,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  modeSelected: { backgroundColor: "#252959", borderColor: "#252959" },
  modeText: { color: "#252959", fontSize: 14, fontWeight: "700" },
  modeTextSelected: { color: "#ffffff" },
  readout: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  time: {
    color: "#1a2454",
    fontSize: 64,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    lineHeight: 76,
  },
  phase: {
    backgroundColor: "#e7eaff",
    borderRadius: 999,
    color: "#2b316e",
    fontSize: 14,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  complete: {
    backgroundColor: "#ecf2ff",
    borderLeftColor: "#4b5d9a",
    borderLeftWidth: 4,
    borderRadius: 6,
    color: "#273a72",
    fontSize: 15,
    lineHeight: 22,
    padding: 12,
  },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#252959",
    borderRadius: 10,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  primaryText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#7d82ac",
    borderRadius: 10,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryText: { color: "#252959", fontSize: 15, fontWeight: "700" },
  help: { color: "#505471", fontSize: 14, lineHeight: 21 },
  disabled: { opacity: 0.55 },
});
