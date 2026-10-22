import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PRACTICE_SHORTCUTS,
  resolvePracticeShortcut,
} from "../apps/web/src/features/study/study-practice-shortcuts.mjs";

const allowed = Object.freeze({
  previous: true,
  next: true,
  reveal: true,
});

function event(key, changes = {}) {
  return {
    key, shiftKey: true, ctrlKey: false,
    altKey: false, metaKey: false,
    repeat: false, isComposing: false, defaultPrevented: false,
    target: { closest: () => null },
    ...changes,
  };
}

test("B182 maps exactly three deliberate Shift shortcuts", () => {
  assert.deepEqual(PRACTICE_SHORTCUTS.map(x => x.key), ["J", "K", "R"]);
  assert.deepEqual(PRACTICE_SHORTCUTS.map(x => x.action),
    ["previous", "next", "reveal"]);
  assert.equal(resolvePracticeShortcut(event("J"), allowed), "previous");
  assert.equal(resolvePracticeShortcut(event("k"), allowed), "next");
  assert.equal(resolvePracticeShortcut(event("R"), allowed), "reveal");
});

test("B182 never captures a normal typing key or unsupported shortcut", () => {
  for (const key of ["j", "k", "r", "J", "K", "R", "Escape", "?", "x"]) {
    assert.equal(resolvePracticeShortcut(event(key, { shiftKey: false }), allowed), null);
  }
  assert.equal(resolvePracticeShortcut(event("Escape"), allowed), null);
  assert.equal(resolvePracticeShortcut(event("X"), allowed), null);
});

test("B182 ignores browser/system modifier combinations", () => {
  for (const modifier of ["ctrlKey", "metaKey", "altKey"]) {
    assert.equal(resolvePracticeShortcut(event("J", { [modifier]: true }), allowed),
      null, modifier);
  }
});

test("B182 ignores repeated, already handled and IME composing keys", () => {
  for (const key of ["repeat", "defaultPrevented", "isComposing"]) {
    assert.equal(resolvePracticeShortcut(event("K", { [key]: true }), allowed),
      null, key);
  }
});

test("B182 never intercepts input, textarea, select and content-editable", () => {
  for (const selector of [
    "input", "textarea", "select",
    '[contenteditable=""]', '[contenteditable="true"]',
    '[role="textbox"]', '[role="combobox"]',
  ]) {
    const target = { closest: (s) => s.includes(selector) ? {} : null };
    assert.equal(resolvePracticeShortcut(event("R", { target }), allowed), null);
  }
  assert.equal(resolvePracticeShortcut(event("R", {
    target: { isContentEditable: true },
  }), allowed), null);
});

test("B182 no authority or ability means no revealed answers or navigation", () => {
  for (const action of ["previous", "next", "reveal"]) {
    const permissions = { ...allowed, [action]: false };
    const key = PRACTICE_SHORTCUTS.find(x => x.action === action).key;
    assert.equal(resolvePracticeShortcut(event(key), permissions), null);
  }
  assert.equal(resolvePracticeShortcut(event("R"), null), null);
});

test("B182 malformed and untrusted keyboard events fail safely", () => {
  for (const bad of [null, undefined, "", "J", {}, { key: 1 }, { key: "R" }]) {
    assert.equal(resolvePracticeShortcut(bad, allowed), null);
  }
});

test("B182 UI stays opt-in and unregisters listener on unmount", async () => {
  const jsx = await readFile("apps/web/src/pages/StudyPracticeShortcuts.tsx", "utf8");
  assert.match(jsx, /useState\(false\)/u);
  assert.match(jsx, /if \(!enabled\) return/u);
  assert.match(jsx, /window\.addEventListener\("keydown", onKeyDown\)/u);
  assert.match(jsx, /window\.removeEventListener\("keydown", onKeyDown\)/u);
  assert.match(jsx, /if \(!action\) return;\s+event\.preventDefault\(\)/u);
  assert.match(jsx, /aria-pressed=\{enabled\}/u);
  assert.match(jsx, /Activar atajos/u);
  assert.match(jsx, /Desactivar atajos/u);
  assert.doesNotMatch(jsx,
    /localStorage|sessionStorage|indexedDB|fetch\(|axios|sendBeacon|Notification|dangerouslySetInnerHTML/u);
});

test("B182 integration stays inside a scoped active authorized round", async () => {
  const page = await readFile("apps/web/src/pages/StudyPractice.tsx", "utf8");
  const anchor = page.indexOf("<StudyPracticeShortcuts");
  const round = page.indexOf('aria-labelledby="study-practice-round"');
  assert.ok(round !== -1 && anchor > round);
  assert.match(page, /<StudyPracticeShortcuts\s+key=\{scope\}/u);
  assert.match(page, /previous: round\.position > 0/u);
  assert.match(page, /next: round\.position < round\.ids\.length - 1/u);
  assert.match(page, /detail\?\.question && !revealed && !revealStatus\?\.busy/u);
  assert.match(page, /onReveal=\{\(\) => void revealAnswers\(\)\}/u);
});

test("B182 mobile targets and focus remain accessible", async () => {
  const stylesheet = await readFile("apps/web/src/pages/StudyPracticeShortcuts.scss", "utf8");
  assert.match(stylesheet, /min-height: 44px/u);
  assert.match(stylesheet, /max-width: 600px/u);
  assert.match(stylesheet, /prefers-reduced-motion/u);
  const existing = await readFile("apps/web/src/pages/StudyPractice.scss", "utf8");
  assert.match(existing, /focus-visible/u);
});
