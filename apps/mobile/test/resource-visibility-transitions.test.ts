import assert from "node:assert/strict";
import test from "node:test";

import type { ResourceVisibility } from "@losapuntes/contracts";

import {
  resourceVisibilityWarning,
  RESOURCE_VISIBILITY_OPTIONS,
} from "../src/features/resources/resource-metadata-policy";

const values: ResourceVisibility[] = ["private", "shared", "public"];

test("all nine before/after visibility combinations have defined consent behavior", () => {
  for (const before of values) {
    for (const after of values) {
      const warning = resourceVisibilityWarning(before, after);
      if (before === after) {
        assert.equal(warning, null);
      } else {
        assert.ok(typeof warning === "string" && warning.length > 20);
      }
    }
  }
});

test("leaving shared revokes prior individual access rather than restoring it", () => {
  for (const after of ["private", "public"] as const) {
    const warning = resourceVisibilityWarning("shared", after);
    assert.match(warning ?? "", /permisos individuales/i);
    assert.match(warning ?? "", /no se recuperar[aá]n/i);
  }
});

test("returning to shared never promises automatic grants", () => {
  for (const before of ["private", "public"] as const) {
    assert.match(
      resourceVisibilityWarning(before, "shared") ?? "",
      /permisos expl[ií]citos/i,
    );
  }
});

test("current visibility is never implied to change merely by selecting an option", () => {
  assert.deepEqual(
    RESOURCE_VISIBILITY_OPTIONS.map((option) => option.value),
    values,
  );
  assert.equal(resourceVisibilityWarning("public", "public"), null);
  assert.equal(resourceVisibilityWarning("private", "private"), null);
});
