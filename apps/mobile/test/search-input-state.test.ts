import assert from "node:assert/strict";
import test from "node:test";

import {
  initialSearchInputState,
  searchInputForState,
  searchInputReducer,
} from "../src/features/search/search-input-state";

test("clearing a selected subject returns Search to its general state", () => {
  const scoped = searchInputReducer(initialSearchInputState, {
    type: "subjectSelected",
    subject: { id: "subject-a", name: "Álgebra" },
  });

  assert.deepEqual(scoped, {
    query: "",
    scope: "resources",
    selectedSubject: { id: "subject-a", name: "Álgebra" },
  });

  const cleared = searchInputReducer(scoped, {
    type: "subjectFilterCleared",
  });

  assert.deepEqual(cleared, initialSearchInputState);
});

test("typing refines the selected subject without silently broadening scope", () => {
  const scoped = searchInputReducer(initialSearchInputState, {
    type: "subjectSelected",
    subject: { id: "subject-a", name: "Álgebra" },
  });

  assert.deepEqual(
    searchInputReducer(scoped, { type: "queryChanged", query: "álgebra" }),
    {
      query: "álgebra",
      scope: "resources",
      selectedSubject: { id: "subject-a", name: "Álgebra" },
    },
  );
});

test("clearing a text query keeps its scope and returns to contextual discovery", () => {
  const withQuery = searchInputReducer(
    { query: "álgebra", scope: "resources", selectedSubject: null },
    { type: "queryChanged", query: "" },
  );

  assert.deepEqual(withQuery, {
    query: "",
    scope: "resources",
    selectedSubject: null,
  });
});

test("changing scope clears the subject filter", () => {
  const scoped = searchInputReducer(initialSearchInputState, {
    type: "subjectSelected",
    subject: { id: "subject-a", name: "Álgebra" },
  });

  assert.deepEqual(
    searchInputReducer(scoped, { type: "scopeChanged", scope: "all" }),
    {
      query: "",
      scope: "all",
      selectedSubject: null,
    },
  );
});

test("broadening a scoped search keeps its query and clears subject context", () => {
  const scoped = {
    query: "integrales",
    scope: "resources" as const,
    selectedSubject: null,
  };

  assert.deepEqual(
    searchInputReducer(scoped, { type: "scopeChanged", scope: "all" }),
    {
      query: "integrales",
      scope: "all",
      selectedSubject: null,
    },
  );
});

test("caps the query at the text field's 120-character limit", () => {
  const longQuery = "a".repeat(130);
  const next = searchInputReducer(initialSearchInputState, {
    type: "queryChanged",
    query: longQuery,
  });

  assert.equal(next.query.length, 120);
});

test("resetAll atomically drops any text, scope and subject context", () => {
  const scenarios = [
    { query: "matrices", scope: "all" as const, selectedSubject: null },
    { query: "", scope: "people" as const, selectedSubject: null },
    { query: "", scope: "resources" as const, selectedSubject: { id: "subject-a", name: "Álgebra" } },
    { query: "parcial", scope: "resources" as const, selectedSubject: { id: "subject-b", name: "Química" } },
  ];

  for (const scenario of scenarios) {
    const reset = searchInputReducer(scenario, { type: "resetAll" });
    assert.deepEqual(reset, initialSearchInputState);
    assert.equal(searchInputForState(reset), null, "Reset must never trigger unfiltered search");
    assert.deepEqual(searchInputReducer(reset, { type: "resetAll" }), initialSearchInputState);
  }
});
