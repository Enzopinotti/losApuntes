import assert from "node:assert/strict";
import test from "node:test";

import {
  mobileSearchLinkKey,
  mobileSearchShareUrl,
  parseMobileSearchLink,
} from "../src/features/search/search-deep-link";
import {
  initialSearchInputState,
  searchInputForState,
  searchInputReducer,
} from "../src/features/search/search-input-state";

const subject = "a23fcd9e-4b2e-4a77-9aa9-8a9a9899a212";

test("restores shared academic query and category", () => {
  const parsed = parseMobileSearchLink({
    q: "  parcial SQL  ",
    scope: "resources",
    subjectId: subject.toUpperCase(),
  });
  assert.deepEqual(parsed, {
    q: "parcial SQL",
    scope: "resources",
    subjectId: subject,
  });
  assert.deepEqual(
    searchInputForState(
      searchInputReducer(initialSearchInputState, {
        type: "sharedSearchOpened",
        input: parsed!,
      }),
    ),
    parsed,
  );
});

test("existing subject-only deep links remain supported", () => {
  const parsed = parseMobileSearchLink({ subjectId: subject });
  assert.deepEqual(parsed, { scope: "resources", subjectId: subject });
  assert.equal(
    mobileSearchShareUrl(parsed!),
    "losapuntes:///search?scope=resources&subjectId=" + subject,
  );
});

test("round-trips unicode and reserved characters through installed-app links", () => {
  const url = mobileSearchShareUrl({
    q: " Análisis & SQL + datos ",
    scope: "resources",
  });
  assert.ok(url);
  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.protocol, "losapuntes:");
  assert.equal(parsedUrl.pathname, "/search");
  const parsed = parseMobileSearchLink({
    q: parsedUrl.searchParams.get("q") ?? undefined,
    scope: parsedUrl.searchParams.get("scope") ?? undefined,
    subjectId: parsedUrl.searchParams.get("subjectId") ?? undefined,
  });
  assert.deepEqual(parsed, { q: "Análisis & SQL + datos", scope: "resources" });
  assert.equal(
    mobileSearchLinkKey(parsed!),
    JSON.stringify(["Análisis & SQL + datos", "resources", null]),
  );
});

test("rejects duplicate or invalid query, scope, and subject", () => {
  const invalidCases = [
    {},
    { q: " " },
    { q: "x" },
    { q: "a".repeat(121) },
    { q: "token" + String.fromCharCode(10) + "secret" },
    { q: ["parcial", "private"] },
    { q: "parcial", scope: ["resources", "people"] },
    { q: "parcial", scope: "unknown" },
    { q: "parcial", subjectId: ["not-a-uuid", subject] },
    { q: "parcial", subjectId: "not-a-uuid" },
    { q: "parcial", scope: "people", subjectId: subject },
    { q: "parcial", scope: "all", subjectId: subject },
    { q: "parcial", scope: "subjects", subjectId: subject },
    { subjectId: "not-a-uuid" },
    { scope: "resources" },
  ];
  for (const params of invalidCases) {
    assert.equal(
      parseMobileSearchLink(params),
      null,
      "Invalid shared links must never silently broaden search",
    );
  }
});

test("sharing never includes session/account fields", () => {
  const url = mobileSearchShareUrl({
    q: "parcial",
    scope: "resources",
    subjectId: subject,
  });
  assert.equal(
    url,
    "losapuntes:///search?q=parcial&scope=resources&subjectId=" + subject,
  );
  assert.equal(url?.includes("session"), false);
  assert.equal(url?.includes("userId"), false);
  assert.equal(url?.includes("credential"), false);
  assert.equal(
    mobileSearchShareUrl({
      q: "parcial",
      scope: "people",
      subjectId: subject,
    }),
    null,
  );
  assert.equal(
    mobileSearchShareUrl({
      q: "parcial",
      scope: "resources",
      subjectId: "bad",
    }),
    null,
  );
});

test("shared link hydration overwrites stale local search in one transition", () => {
  const old = {
    query: "other",
    scope: "resources" as const,
    selectedSubject: { id: "old-subject", name: "Privada" },
  };
  const next = searchInputReducer(old, {
    type: "sharedSearchOpened",
    input: { q: "redes", scope: "people" },
  });
  assert.deepEqual(next, {
    query: "redes",
    scope: "people",
    selectedSubject: null,
  });
  assert.deepEqual(
    searchInputReducer(next, {
      type: "sharedSearchOpened",
      input: { q: "parcial", scope: "resources", subjectId: subject },
    }),
    {
      query: "parcial",
      scope: "resources",
      selectedSubject: { id: subject, name: "esta materia" },
    },
  );
});

test("invalid incoming link clears previous selected subject without a query", () => {
  const old = {
    query: "private",
    scope: "resources" as const,
    selectedSubject: { id: "stale-subject", name: "Materia anterior" },
  };
  assert.equal(
    parseMobileSearchLink({ q: "x", scope: "resources", subjectId: subject }),
    null,
  );
  assert.deepEqual(
    searchInputReducer(old, { type: "invalidSharedSearchOpened" }),
    initialSearchInputState,
  );
});

test("search link integration is explicit, session-scoped, and storage-free", async () => {
  const { readFile } = await import("node:fs/promises");
  const url = new URL("../src/features/search/search-screen.tsx", import.meta.url);
  const screen = await readFile(url, "utf8");
  assert.match(screen, /useLocalSearchParams/u);
  assert.match(screen, /parseMobileSearchLink/u);
  assert.match(screen, /mobileSearchLinkKey/u);
  assert.match(screen, /sharedSearchOpened/u);
  assert.match(screen, /controller\.cancelSearch\(\)/u);
  assert.match(screen, /handledIncomingSearch\.current/u);
  assert.match(screen, /invalidSharedSearchOpened/u);
  assert.match(screen, /incomingRouteKey/u);
  assert.match(screen, /Share\.share\(\{ message: url \}\)/u);
  assert.match(screen, /accessibilityLabel="Compartir búsqueda y filtro actual"/u);
  assert.match(screen, /accessibilityRole="alert"/u);
  assert.doesNotMatch(screen, /AsyncStorage|localStorage|sessionStorage/u);
});
