export type RunnerShortcutAction = "previous" | "next" | "clock";
export type RunnerShortcutAllowed = Readonly<Record<RunnerShortcutAction, boolean>>;
export type RunnerKeyEvent = {
  key?: string;
  defaultPrevented?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  target?: EventTarget | null;
};
export const RUNNER_SHORTCUTS: readonly Readonly<{
  key: "J" | "K" | "P";
  action: RunnerShortcutAction;
  description: string;
}>[];
export function resolveRunnerShortcut(
  event: RunnerKeyEvent,
  allowed: RunnerShortcutAllowed,
): RunnerShortcutAction | null;
