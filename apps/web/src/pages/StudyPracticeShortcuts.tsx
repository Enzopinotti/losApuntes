import { useEffect, useState } from "react";
import {
  PRACTICE_SHORTCUTS,
  resolvePracticeShortcut,
  type PracticeShortcutPermissions,
} from "../features/study/study-practice-shortcuts.mjs";
import "./StudyPracticeShortcuts.scss";

type Props = {
  allowed: PracticeShortcutPermissions;
  onPrevious: () => void;
  onNext: () => void;
  onReveal: () => void;
};

/**
 * Mount this only for an authorized active practice round, keyed by the
 * current account/session/subject scope. The feature is opt-in on every round.
 */
export default function StudyPracticeShortcuts({
  allowed,
  onPrevious,
  onNext,
  onReveal,
}: Props) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolvePracticeShortcut(event, allowed);
      if (!action) return;
      event.preventDefault();
      if (action === "previous") onPrevious();
      if (action === "next") onNext();
      if (action === "reveal") onReveal();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [allowed, enabled, onPrevious, onNext, onReveal]);

  return (
    <aside
      className="study-practice-shortcuts"
      aria-label="Atajos de esta ronda"
    >
      <div className="study-practice-shortcuts-top">
        <div>
          <h3>Atajos opcionales de teclado</h3>
          <p>
            Activá los atajos solo si los querés usar. No funcionan mientras
            escribís en un campo ni modifican tu respuesta automáticamente.
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
        <div className="study-practice-shortcuts-help" role="status">
          <p>Mantené Mayús y presioná una de estas teclas:</p>
          <ul>
            {PRACTICE_SHORTCUTS.map((shortcut) => (
              <li key={shortcut.action}>
                <kbd>Mayús + {shortcut.key}</kbd> — {shortcut.label}
                {!allowed[shortcut.action] && " (no disponible ahora)"}
              </li>
            ))}
          </ul>
          <p>
            Revelar respuestas requiere una pregunta cargada. Para clasificar tu
            aprendizaje, seguí usando los botones explícitos.
          </p>
        </div>
      )}
    </aside>
  );
}
