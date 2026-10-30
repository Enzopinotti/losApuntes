import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  RUNNER_SHORTCUTS,
  resolveRunnerShortcut,
} from "../apps/web/src/features/study/study-runner-shortcuts.mjs";

const granted = { previous: true, next: true, clock: true };
function key(keyName, rest = {}) {
  return {
    key: keyName, shiftKey: true, ctrlKey: false, altKey: false,
    metaKey: false, repeat: false, isComposing: false, defaultPrevented: false,
    target: { closest: () => null },
    ...rest,
  };
}

test("B279 declares only non-destructive actions and exact Shift+J/K/P", () => {
  assert.deepEqual(RUNNER_SHORTCUTS.map((s) => s.key), ["J", "K", "P"]);
  assert.deepEqual(RUNNER_SHORTCUTS.map((s) => s.action),
    ["previous", "next", "clock"]);
  assert.equal(resolveRunnerShortcut(key("J"), granted), "previous");
  assert.equal(resolveRunnerShortcut(key("k"), granted), "next");
  assert.equal(resolveRunnerShortcut(key("P"), granted), "clock");
  assert.equal(resolveRunnerShortcut(key("R"), granted), null);
  assert.equal(resolveRunnerShortcut(key("Enter"), granted), null);
});

test("B279 rejects standard typing and OS/browser modifiers", () => {
  for (const candidate of ["J", "K", "P"]) {
    assert.equal(resolveRunnerShortcut(key(candidate, { shiftKey: false }), granted), null);
    for (const mod of ["ctrlKey", "altKey", "metaKey"]) {
      assert.equal(resolveRunnerShortcut(key(candidate, { [mod]: true }), granted), null);
    }
  }
});

test("B279 ignores IME, held key repeat and previously handled events", () => {
  for (const reason of ["repeat", "isComposing", "defaultPrevented"]) {
    assert.equal(resolveRunnerShortcut(key("K", { [reason]: true }), granted), null);
  }
});

test("B279 prevents shortcut capture while writing in any editor", () => {
  for (const editor of ["input", "textarea", "select", "[contenteditable]",
    '[role="textbox"]', '[role="combobox"]']) {
    const target = { closest: (selector) => selector.includes(editor) ? {} : null };
    assert.equal(resolveRunnerShortcut(key("P", { target }), granted), null);
  }
  assert.equal(resolveRunnerShortcut(key("P", { target: {
    isContentEditable: true, closest: () => null,
  } }), granted), null);
});

test("B279 allows deliberate keyboard shortcuts while the toggle retains focus", () => {
  const target = {
    closest: (selector) => selector.includes("button") ? {} : null,
  };
  assert.equal(resolveRunnerShortcut(key("K", { target }), granted), "next");
});

test("B279 cannot intercept a disabled or unauthorized action", () => {
  assert.equal(resolveRunnerShortcut(key("J"), { ...granted, previous: false }), null);
  assert.equal(resolveRunnerShortcut(key("K"), { ...granted, next: false }), null);
  assert.equal(resolveRunnerShortcut(key("P"), { ...granted, clock: false }), null);
  assert.equal(resolveRunnerShortcut(key("P"), null), null);
  assert.equal(resolveRunnerShortcut(null, granted), null);
  assert.equal(resolveRunnerShortcut({ key: 1, shiftKey: true }, granted), null);
});

test("B279 opt-in is temporary, cleans listeners, guards hidden documents", async () => {
  const s = await readFile("apps/web/src/pages/StudyRunnerShortcuts.tsx", "utf8");
  assert.match(s, /useState\(false\)/u);
  assert.match(s, /if \(!enabled\) return/u);
  assert.match(s, /window\.addEventListener\("keydown", onKeyDown\)/u);
  assert.match(s, /window\.removeEventListener\("keydown", onKeyDown\)/u);
  assert.match(s, /if \(document\.hidden\) return/u);
  assert.match(s, /if \(!action\) return;\s+event\.preventDefault\(\)/u);
  assert.match(s, /aria-pressed=\{enabled\}/u);
  assert.doesNotMatch(s, /fetch\(|axios|sessionStorage|localStorage|sendBeacon|navigator\.clipboard|onDone|onDelete|setProgress/u);
});

test("B279 only mounts with active verified task and uses existing authority guards", async () => {
  const s = await readFile("apps/web/src/pages/StudyRunner.tsx", "utf8");
  const taskIndex = s.indexOf("{task && (");
  const panelIndex = s.indexOf("<StudyRunnerShortcuts");
  assert.ok(taskIndex !== -1 && panelIndex > taskIndex);
  assert.match(s, /<StudyRunnerShortcuts\s+key=\{/u);
  assert.match(s, /previous:\s+!busy && !remoteBusy && runner\.index > 0/u);
  assert.match(s, /next:\s+!busy &&\s+!remoteBusy/u);
  assert.match(s, /clock:\s+!busy &&\s+!remoteBusy &&\s+Boolean\(label\)/u);
  assert.match(s, /!task\.done &&\s+Boolean\(activeClock\) &&\s+remainingMs > 0/u);
  assert.match(s, /onPrevious=\{\(\) => move\(runner\.index - 1\)\}/u);
  assert.match(s, /onNext=\{\(\) => move\(runner\.index \+ 1\)\}/u);
  assert.match(s, /onClock=\{\(\) => changeClock\("toggle"\)\}/u);
});

test("B279 UI uses explicit non-destructive guidance and accessible targets", async () => {
  const ui = await readFile("apps/web/src/pages/StudyRunnerShortcuts.tsx", "utf8");
  assert.match(ui, /Activar atajos/u);
  assert.match(ui, /Desactivar atajos/u);
  assert.match(ui, /las valoraciones y el progreso remoto/u);
  const css = await readFile("apps/web/src/pages/StudyRunnerShortcuts.scss", "utf8");
  assert.match(css, /min-height: 44px/u);
  assert.match(css, /focus-visible/u);
  assert.match(css, /max-width: 600px/u);
  assert.match(css, /prefers-reduced-motion/u);
});
