import { useEffect, useState } from "react";
import {
  RUNNER_SHORTCUTS,
  resolveRunnerShortcut,
  type RunnerShortcutAllowed,
} from "../features/study/study-runner-shortcuts.mjs";
import "./StudyRunnerShortcuts.scss";

type Props = {
  allowed: RunnerShortcutAllowed;
  onPrevious: () => void;
  onNext: () => void;
  onClock: () => void;
};

/**
 * Optional per-plan controls; mount only inside an authorized active runner.
 * No persistence, remote calls or shortcuts that mutate study completion.
 */
export default function StudyRunnerShortcuts({
  allowed,
  onPrevious,
  onNext,
  onClock,
}: Props) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (document.hidden) return;
      const action = resolveRunnerShortcut(event, allowed);
      if (!action) return;
      event.preventDefault();
      if (action === "previous") onPrevious();
      if (action === "next") onNext();
      if (action === "clock") onClock();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [allowed, enabled, onPrevious, onNext, onClock]);

  return (
    <aside className="study-runner-shortcuts" aria-label="Atajos de esta sesión">
      <div className="study-runner-shortcuts-heading">
        <div>
          <h3>Controlá tu sesión con el teclado</h3>
          <p>
            Atajos opcionales, desactivados por defecto. No se aplican al
            escribir en un campo ni al cambiar de pestaña.
          </p>
        </div>
        <button
          type="button"
          aria-pressed={enabled}
          onClick={() => setEnabled((current) => !current)}
        >
          {enabled ? "Desactivar atajos" : "Activar atajos"}
        </button>
      </div>
      {enabled && (
        <div className="study-runner-shortcuts-help" role="status">
          <p>Mantené Mayús y presioná una tecla:</p>
          <ul>
            {RUNNER_SHORTCUTS.map((shortcut) => (
              <li key={shortcut.action}>
                <kbd>Mayús + {shortcut.key}</kbd> — {shortcut.description}
                {!allowed[shortcut.action] && " (no disponible ahora)"}
              </li>
            ))}
          </ul>
          <p>
            Las actividades realizadas, las valoraciones y el progreso remoto
            siguen requiriendo sus botones explícitos.
          </p>
        </div>
      )}
    </aside>
  );
}
