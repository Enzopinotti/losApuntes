/**
 * Deliberate, opt-in study practice keyboard controls.
 * The classifier has no side effects; consumers call preventDefault only on
 * a recognized and authorized action.
 */
export const PRACTICE_SHORTCUTS = Object.freeze([
  Object.freeze({ key: "J", action: "previous", label: "Pregunta anterior" }),
  Object.freeze({ key: "K", action: "next", label: "Pregunta siguiente" }),
  Object.freeze({ key: "R", action: "reveal", label: "Mostrar respuestas" }),
]);

const EDITABLE_SELECTOR =
  'input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"],[role="combobox"]';

function isEditable(target) {
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable === true) return true;
  if (typeof target.closest !== "function") return false;
  return target.closest(EDITABLE_SELECTOR) !== null;
}

/**
 * Accept only shift+single letter with no Alt/Control/Meta, no repetition,
 * no IME composition and never while focus is inside an editable surface.
 * A blocked action does NOT consume the user's native key event.
 */
export function resolvePracticeShortcut(event, allowed) {
  if (!event || typeof event !== "object" || !allowed ||
      typeof allowed !== "object") return null;
  if (event.defaultPrevented || event.repeat || event.isComposing ||
      !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey ||
      isEditable(event.target)) return null;

  const key = typeof event.key === "string" ? event.key.toUpperCase() : "";
  const shortcut = PRACTICE_SHORTCUTS.find((candidate) =>
    candidate.key === key,
  );
  if (!shortcut || allowed[shortcut.action] !== true) return null;
  return shortcut.action;
}
