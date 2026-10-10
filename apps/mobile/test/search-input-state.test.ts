import assert from "node:assert/strict";
import test from "node:test";

import {
  initialSearchInputState,
  searchInputReducer,
} from "../src/features/search/search-input-state";

test("clearing a selected subject returns Search to its general state", () => {
  const scoped = searchInputReducer(initialSearchInputState, {
    type: "subjectSelected",
    subjectId: "subject-a",
  });

  assert.deepEqual(scoped, {
    query: "",
    scope: "resources",
    subjectId: "subject-a",
  });

  const cleared = searchInputReducer(scoped, {
    type: "subjectFilterCleared",
  });

  assert.deepEqual(cleared, initialSearchInputState);
});

test("typing clears the subject filter while preserving the selected scope", () => {
  const scoped = searchInputReducer(initialSearchInputState, {
    type: "subjectSelected",
    subjectId: "subject-a",
  });

  assert.deepEqual(
    searchInputReducer(scoped, { type: "queryChanged", query: "álgebra" }),
    { query: "álgebra", scope: "resources", subjectId: null },
  );
});

test("clearing a text query keeps its scope and returns to contextual discovery", () => {
  const withQuery = searchInputReducer(
    { query: "álgebra", scope: "resources", subjectId: null },
    { type: "queryChanged", query: "" },
  );

  assert.deepEqual(withQuery, {
    query: "",
    scope: "resources",
    subjectId: null,
  });
});

test("changing scope clears the subject filter", () => {
  const scoped = searchInputReducer(initialSearchInputState, {
    type: "subjectSelected",
    subjectId: "subject-a",
  });

  assert.deepEqual(
    searchInputReducer(scoped, { type: "scopeChanged", scope: "all" }),
    {
      query: "",
      scope: "all",
      subjectId: null,
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
