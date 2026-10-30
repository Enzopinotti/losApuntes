/**
 * B216: no implicit keyboard capture. These shortcuts are a temporary,
 * explicitly enabled display affordance, not a study-progress action.
 */
export const RUNNER_SHORTCUTS = Object.freeze([
  Object.freeze({ key: "J", action: "previous", description: "Actividad anterior" }),
  Object.freeze({ key: "K", action: "next", description: "Actividad siguiente" }),
  Object.freeze({ key: "P", action: "clock", description: "Pausar o reanudar" }),
]);

const INTERACTIVE = [
  "input", "textarea", "select",
  "[contenteditable]", '[role="textbox"]', '[role="combobox"]',
].join(",");

export function resolveRunnerShortcut(event, allowed) {
  if (!event || typeof event !== "object" ||
      !allowed || typeof allowed !== "object" ||
      event.defaultPrevented || event.repeat || event.isComposing ||
      !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    return null;
  }
  const target = event.target;
  if (target && typeof target === "object") {
    if (target.isContentEditable === true) return null;
    if (typeof target.closest === "function" &&
        target.closest(INTERACTIVE)) return null;
  }
  const key = typeof event.key === "string" ? event.key.toUpperCase() : "";
  const shortcut = RUNNER_SHORTCUTS.find((entry) => entry.key === key);
  if (!shortcut || allowed[shortcut.action] !== true) return null;
  return shortcut.action;
}
