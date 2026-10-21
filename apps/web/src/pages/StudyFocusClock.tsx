import { useEffect, useState } from "react";

import {
  advanceFocusClock,
  createFocusClock,
  formatFocusRemaining,
  pauseFocusClock,
  resetFocusClock,
  selectFocusMode,
  startFocusClock,
  type FocusClock,
} from "../features/study/study-focus-clock.mjs";

import "./StudyFocusClock.scss";

/**
 * The parent supplies a key composed of the current session and subject.
 * React unmounts this component when either identity changes, discarding
 * all clock state. No local/session storage, background notifications or API.
 */
export default function StudyFocusClock() {
  const [clock, setClock] = useState<FocusClock>(() => createFocusClock());
  const [completionAcknowledged, setCompletionAcknowledged] = useState(false);

  useEffect(() => {
    if (clock.phase !== "running") return;
    const reconcile = () => {
      setClock((previous) => advanceFocusClock(previous, Date.now()));
    };
    const intervalId = window.setInterval(reconcile, 1000);
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("focus", reconcile);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("focus", reconcile);
    };
  }, [clock.phase]);

  const start = () => {
    setCompletionAcknowledged(false);
    setClock((previous) => startFocusClock(previous, Date.now()));
  };
  const pause = () => {
    setClock((previous) => pauseFocusClock(previous, Date.now()));
  };
  const reset = () => {
    setCompletionAcknowledged(false);
    setClock((previous) => resetFocusClock(previous));
  };
  const select = (mode: "study" | "rest") => {
    setCompletionAcknowledged(false);
    setClock(selectFocusMode(mode));
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

  return (
    <section className="study-focus-card" aria-labelledby="study-focus-title">
      <header>
        <h2 id="study-focus-title">Tiempo para concentrarte</h2>
        <p>
          Un intervalo corto y voluntario para tu materia. Nada se registra ni se
          comparte.
        </p>
      </header>

      <div className="study-focus-modes" role="group" aria-label="Elegir intervalo">
        <button
          type="button"
          aria-pressed={clock.mode === "study"}
          disabled={clock.phase === "running"}
          onClick={() => select("study")}
        >
          Estudiar · 25 min
        </button>
        <button
          type="button"
          aria-pressed={clock.mode === "rest"}
          disabled={clock.phase === "running"}
          onClick={() => select("rest")}
        >
          Descansar · 5 min
        </button>
      </div>

      <div className="study-focus-readout">
        <p className="study-focus-time" aria-label="Tiempo restante">
          <time aria-live="off">{formatFocusRemaining(clock.remainingMs)}</time>
        </p>
        <p className="study-focus-phase">{phaseText}</p>
        {done && !completionAcknowledged && (
          <p role="status" aria-live="polite" className="study-focus-complete">
            Intervalo terminado. Elegí si querés descansar o continuar.
            No iniciamos otro intervalo automáticamente.
          </p>
        )}
      </div>

      <div className="study-focus-controls">
        {clock.phase === "running" ? (
          <button type="button" onClick={pause}>
            Pausar
          </button>
        ) : !done ? (
          <button type="button" onClick={start}>
            {clock.phase === "paused" ? "Reanudar" : "Iniciar"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCompletionAcknowledged(true)}
            disabled={completionAcknowledged}
          >
            Entendido
          </button>
        )}
        <button type="button" onClick={reset}>
          Reiniciar intervalo
        </button>
      </div>
      <p className="study-focus-help">
        Si cambiás de materia, sesión o salís de esta página, el contador se
        descarta. Al volver no se restauran tiempos ni se acumulan rachas.
      </p>
    </section>
  );
}
