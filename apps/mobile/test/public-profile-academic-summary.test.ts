import assert from "node:assert/strict";
import test from "node:test";

import { publicProfileAcademicSummary } from "../src/features/search/public-profile-academic-summary";

test("public profile academic summary uses singular labels for one item", () => {
  assert.deepEqual(
    publicProfileAcademicSummary({
      affiliations: [{}],
      participations: [{}],
      currentContext: null,
    }),
    ["1 afiliación académica publicada.", "1 materia asociada."],
  );
});

test("public profile academic summary uses counts without exposing projection rows", () => {
  assert.deepEqual(
    publicProfileAcademicSummary({
      affiliations: [{ name: "private institution projection" }, {}],
      participations: [{ title: "private subject projection" }, {}, {}],
      currentContext: { subjectId: "private-context" },
    }),
    ["2 afiliaciones académicas publicadas.", "3 materias asociadas."],
  );
});

test("public profile academic summary honestly represents empty public counts", () => {
  assert.deepEqual(
    publicProfileAcademicSummary({
      affiliations: [],
      participations: [],
      currentContext: null,
    }),
    ["0 afiliaciones académicas publicadas.", "0 materias asociadas."],
  );
});
