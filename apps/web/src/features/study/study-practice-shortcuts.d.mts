export type PracticeShortcutAction = "previous" | "next" | "reveal";
export type PracticeShortcutPermissions = Readonly<Record<PracticeShortcutAction, boolean>>;
export type ShortcutKeyEvent = {
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
export const PRACTICE_SHORTCUTS: readonly Readonly<{
  key: "J" | "K" | "R";
  action: PracticeShortcutAction;
  label: string;
}>[];
export function resolvePracticeShortcut(
  event: ShortcutKeyEvent,
  allowed: PracticeShortcutPermissions,
): PracticeShortcutAction | null;
