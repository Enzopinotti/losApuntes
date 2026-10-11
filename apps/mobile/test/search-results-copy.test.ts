import assert from "node:assert/strict";
import test from "node:test";

import { searchResultSummary } from "../src/features/search/search-results-copy";

test("the all scope counts each visible result category", () => {
  assert.equal(
    searchResultSummary({ resources: 2, subjects: 1, people: 3 }, "all"),
    "Encontramos 6 resultados.",
  );
});

test("a selected scope excludes categories that are not shown", () => {
  assert.equal(
    searchResultSummary({ resources: 2, subjects: 4, people: 1 }, "resources"),
    "Encontramos 2 resultados.",
  );
  assert.equal(
    searchResultSummary({ resources: 5, subjects: 1, people: 4 }, "subjects"),
    "Encontramos 1 resultado.",
  );
});

test("the empty summary does not imply results that the server did not return", () => {
  assert.equal(
    searchResultSummary({ resources: 0, subjects: 0, people: 0 }, "all"),
    "No encontramos resultados para esta búsqueda.",
  );
});
