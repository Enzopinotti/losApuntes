import assert from "node:assert/strict";
import test from "node:test";

import {
  searchResultSummary,
  searchScopeRecoveryCopy,
} from "../src/features/search/search-results-copy";

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

test("a scoped empty text search offers to retry across all result types", () => {
  assert.deepEqual(
    searchScopeRecoveryCopy(
      { resources: 0, subjects: 0, people: 0 },
      "resources",
      "  ecuaciones  ",
    ),
    {
      message: "No encontramos resultados para “ecuaciones” en Apuntes.",
      actionLabel: "Buscar en todo",
    },
  );
});

test("the recovery message names the selected scope for each result category", () => {
  const counts = { resources: 0, subjects: 0, people: 0 };
  assert.equal(
    searchScopeRecoveryCopy(counts, "subjects", "algoritmos")?.message,
    "No encontramos resultados para “algoritmos” en Materias.",
  );
  assert.equal(
    searchScopeRecoveryCopy(counts, "people", "algoritmos")?.message,
    "No encontramos resultados para “algoritmos” en Personas.",
  );
});

test("scope recovery stays hidden for global, non-empty, or too-short searches", () => {
  assert.equal(
    searchScopeRecoveryCopy(
      { resources: 0, subjects: 0, people: 0 },
      "all",
      "ecuaciones",
    ),
    null,
  );
  assert.equal(
    searchScopeRecoveryCopy(
      { resources: 1, subjects: 0, people: 0 },
      "resources",
      "ecuaciones",
    ),
    null,
  );
  assert.equal(
    searchScopeRecoveryCopy(
      { resources: 0, subjects: 0, people: 0 },
      "people",
      " a ",
    ),
    null,
  );
});
