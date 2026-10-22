import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MobileSearchResumeMemory } from "../src/features/search/search-resume-memory";

const firstSession = "user-a:session-1";
const secondSession = "user-b:session-2";
const subject = "a23fcd9e-4b2e-4a77-9aa9-8a9a9899a212";

test("keeps a validated query only for its current session", () => {
  const memory = new MobileSearchResumeMemory();
  memory.setSession(firstSession);
  memory.remember(firstSession, {
    q: "  parcial SQL  ",
    scope: "resources",
    subjectId: subject,
  });

  assert.deepEqual(memory.get(firstSession), {
    q: "parcial SQL",
    scope: "resources",
    subjectId: subject,
  });
  assert.equal(memory.get(secondSession), null);
  assert.equal(memory.has(firstSession), true);
});

test("rejects invalid filters and clears when the session changes", () => {
  const memory = new MobileSearchResumeMemory();
  memory.setSession(firstSession);
  memory.remember(firstSession, { q: "parcial", scope: "resources" });
  memory.remember(firstSession, {
    q: "private",
    scope: "people",
    subjectId: subject,
  });

  assert.equal(memory.get(firstSession), null);
  memory.remember(firstSession, { q: "parcial", scope: "resources" });
  memory.setSession(secondSession);
  assert.equal(memory.get(firstSession), null);
  assert.equal(memory.get(secondSession), null);
});

test("retains subject-only filters and returns a defensive copy", () => {
  const memory = new MobileSearchResumeMemory();
  memory.setSession(firstSession);
  memory.remember(firstSession, { scope: "resources", subjectId: subject });

  const result = memory.get(firstSession);
  assert.deepEqual(result, { scope: "resources", subjectId: subject });
  if (!result) throw new Error("Expected the subject filter to be retained");
  result.subjectId = "changed";
  assert.deepEqual(memory.get(firstSession), {
    scope: "resources",
    subjectId: subject,
  });
});

test("clearing the active query notifies Home subscribers", () => {
  const memory = new MobileSearchResumeMemory();
  let notifications = 0;
  memory.setSession(firstSession);
  const unsubscribe = memory.subscribe(() => {
    notifications += 1;
  });
  memory.remember(firstSession, { q: "parcial", scope: "resources" });
  memory.clear(firstSession);
  memory.clear(firstSession);
  unsubscribe();

  assert.equal(notifications, 2);
  assert.equal(memory.has(firstSession), false);
});

test("Home exposes a generic resume action and passes no search text in its route", () => {
  const card = readFileSync(
    new URL(
      "../src/features/home/home-search-resume-card.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const home = readFileSync(
    new URL("../src/features/home/home-screen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    home,
    /<HomeSearchResumeCard sessionAuthorityKey=\{sessionAuthority\} \/>/u,
  );
  assert.match(card, /accessibilityLabel="Continuar búsqueda"/u);
  assert.match(card, /params: \{ resumeRecentSearch: "1" \}/u);
  assert.doesNotMatch(card, /params: \{[^}]*\bq:/su);
});

test("Search restores only through the session memory marker and strips the marker", () => {
  const screen = readFileSync(
    new URL("../src/features/search/search-screen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(screen, /mobileSearchResumeMemory\.get\(sessionAuthority\)/u);
  assert.match(screen, /type: "sharedSearchOpened"/u);
  assert.match(screen, /type: "invalidSharedSearchOpened"/u);
  assert.ok(screen.includes('router.replace("/(tabs)/search")'));
  assert.match(screen, /resumeSearchRevision/u);
  assert.doesNotMatch(screen, /AsyncStorage|localStorage|sessionStorage/u);
});
