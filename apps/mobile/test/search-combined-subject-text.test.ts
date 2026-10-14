import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { SearchResponse } from "@losapuntes/contracts";

import {
  initialSearchInputState,
  searchInputForState,
  searchInputReducer,
} from "../src/features/search/search-input-state";
import { MobileSearchController } from "../src/features/search/search-controller";
import { parseMobileSearchLink } from "../src/features/search/search-deep-link";
import type {
  MobileSearchApi,
  MobileSearchInput,
} from "../src/features/search/search-api";

const subjectId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

function selected() {
  return searchInputReducer(initialSearchInputState, {
    type: "subjectSelected",
    subject: { id: subjectId, name: "Análisis" },
  });
}

function response(q: string): SearchResponse {
  return {
    query: q,
    scope: "resources",
    results: { resources: [], subjects: [], people: [] },
  };
}

test("Subject-only browsing continues to work without typing", () => {
  assert.deepEqual(searchInputForState(selected()), {
    scope: "resources",
    subjectId,
  });
});

test("two or more characters narrow the Subject rather than removing it", () => {
  const state = searchInputReducer(selected(), {
    type: "queryChanged",
    query: "  integrales  ",
  });
  assert.deepEqual(state.selectedSubject, { id: subjectId, name: "Análisis" });
  assert.deepEqual(searchInputForState(state), {
    q: "integrales",
    scope: "resources",
    subjectId,
  });
});

test("one character or spaces never silently fall back to the broad Subject result", () => {
  const tooShort = searchInputReducer(selected(), {
    type: "queryChanged",
    query: " x ",
  });
  assert.equal(searchInputForState(tooShort), null);
  const spaces = searchInputReducer(selected(), {
    type: "queryChanged",
    query: "    ",
  });
  assert.equal(searchInputForState(spaces), null);
  assert.deepEqual(
    searchInputForState(
      searchInputReducer(spaces, {
        type: "queryChanged",
        query: "",
      }),
    ),
    { scope: "resources", subjectId },
  );
});

test("removing Subject preserves typed text for searching all resource Subjects", () => {
  const typed = searchInputReducer(selected(), {
    type: "queryChanged",
    query: "  derivadas  ",
  });
  const broadened = searchInputReducer(typed, {
    type: "subjectFilterCleared",
  });
  assert.deepEqual(broadened, {
    query: "  derivadas  ",
    scope: "resources",
    selectedSubject: null,
  });
  assert.deepEqual(searchInputForState(broadened), {
    q: "derivadas",
    scope: "resources",
  });
});

test("clearing only text preserves Subject and recovers the Subject-only results", () => {
  const typed = searchInputReducer(selected(), {
    type: "queryChanged",
    query: "vectores",
  });
  const cleared = searchInputReducer(typed, {
    type: "queryChanged",
    query: "",
  });
  assert.deepEqual(searchInputForState(cleared), {
    scope: "resources",
    subjectId,
  });
  assert.deepEqual(cleared.selectedSubject, selected().selectedSubject);
});

test("clearing Subject without typed text resets to the general unfiltered search", () => {
  assert.deepEqual(
    searchInputReducer(selected(), {
      type: "subjectFilterCleared",
    }),
    initialSearchInputState,
  );
});

test("choosing another Subject clears stale text and replaces its academic filter", () => {
  const typed = searchInputReducer(selected(), {
    type: "queryChanged",
    query: "integrales",
  });
  const changed = searchInputReducer(typed, {
    type: "subjectSelected",
    subject: { id: otherId, name: "Física" },
  });
  assert.deepEqual(searchInputForState(changed), {
    scope: "resources",
    subjectId: otherId,
  });
  assert.equal(changed.query, "");
});

test("switching to general scope intentionally broadens results and retains keywords", () => {
  const typed = searchInputReducer(selected(), {
    type: "queryChanged",
    query: "ondas",
  });
  const broadened = searchInputReducer(typed, {
    type: "scopeChanged",
    scope: "all",
  });
  assert.deepEqual(searchInputForState(broadened), {
    q: "ondas",
    scope: "all",
  });
});

test("query maximum and minimum apply while Subject filter remains active", () => {
  const state = searchInputReducer(selected(), {
    type: "queryChanged",
    query: "a".repeat(250),
  });
  assert.equal(state.query.length, 120);
  assert.equal(state.selectedSubject?.id, subjectId);
  assert.equal(searchInputForState(state)?.q?.length, 120);
});

test("controller sends both filter dimensions and fences older cross-Subject answers", async () => {
  let replyOld!: (response: SearchResponse) => void;
  const stale = new Promise<SearchResponse>((resolve) => {
    replyOld = resolve;
  });
  const inputs: MobileSearchInput[] = [];
  const signals: AbortSignal[] = [];
  const api = {
    search: async (input: MobileSearchInput, signal?: AbortSignal) => {
      inputs.push(input);
      signals.push(signal!);
      return inputs.length === 1 ? stale : response(input.q ?? "");
    },
    contextualDiscovery: async () => ({ subjects: [] }),
  } as unknown as MobileSearchApi;
  const controller = new MobileSearchController(api);
  const first = controller.search("user:session", {
    q: "límites",
    scope: "resources",
    subjectId,
  });
  await controller.search("user:session", {
    q: "límites",
    scope: "resources",
    subjectId: otherId,
  });
  replyOld(response("límites"));
  await first;
  assert.equal(signals[0]?.aborted, true);
  assert.equal(inputs[1]?.subjectId, otherId);
  const state = controller.getSearchSnapshot();
  assert.equal(state.kind, "ready");
  if (state.kind === "ready") {
    assert.equal(state.subjectId, otherId);
    assert.equal(state.query, "límites");
  }
});

test("Search UI shows separate recovery actions and fences by q/scope/Subject", () => {
  const search = readFileSync(
    new URL("../src/features/search/search-screen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(search, /searchInputForState\(searchInputState\)/u);
  assert.match(search, /search\.subjectId \?\? null/u);
  assert.match(search, /search\.query === \(searchInput\.q \?\? ""\)/u);
  assert.match(search, /Buscar texto en todas las materias/u);
  assert.match(search, /Ver materia sin texto/u);
  assert.match(search, /scopedSubjectEmpty/u);
  assert.match(
    search,
    /selectedSubject\s*\?\s*null\s*:\s*searchScopeRecoveryCopy/u,
  );
});

test("Subject deep links still target the same existing authorized search path", () => {
  const search = readFileSync(
    new URL("../src/features/search/search-screen.tsx", import.meta.url),
    "utf8",
  );
  assert.deepEqual(parseMobileSearchLink({ subjectId }), {
    scope: "resources",
    subjectId,
  });
  assert.match(search, /parseMobileSearchLink/u);
  assert.match(search, /sharedSearchOpened/u);
  assert.match(
    search,
    /controller\.scheduleSearch\(authorityKey, searchInput\)/u,
  );
});
