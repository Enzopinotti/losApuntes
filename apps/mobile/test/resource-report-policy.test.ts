import assert from "node:assert/strict";
import test from "node:test";

import {
  RESOURCE_REPORT_REASONS,
  RESOURCE_REPORT_DETAILS_MAX_LENGTH,
  validateResourceReport,
} from "../src/features/resources/resource-report-policy";

test("report reasons match the backend moderation vocabulary", () => {
  assert.deepEqual(
    RESOURCE_REPORT_REASONS.map((reason) => reason.value),
    ["spam", "plagiarism", "copyright", "honor_code", "inappropriate", "other"],
  );
});

test("report form requires an allowed reason and supports empty details", () => {
  assert.deepEqual(validateResourceReport(null, ""), {
    kind: "invalid",
    message: "Elegí el motivo del reporte.",
  });
  assert.deepEqual(validateResourceReport("spam", "   "), {
    kind: "valid",
    input: { reason: "spam" },
  });
  assert.equal(
    validateResourceReport("not_supported" as "spam", "").kind,
    "invalid",
  );
});

test("report details are trimmed, optional and bounded by backend contract", () => {
  assert.deepEqual(validateResourceReport("plagiarism", "  Copiado  "), {
    kind: "valid",
    input: { reason: "plagiarism", details: "Copiado" },
  });
  assert.equal(validateResourceReport("other", "ab").kind, "invalid");
  assert.equal(validateResourceReport("other", "x".repeat(1500)).kind, "valid");
  assert.equal(
    validateResourceReport("other", "x".repeat(1501)).kind,
    "invalid",
  );
  assert.equal(RESOURCE_REPORT_DETAILS_MAX_LENGTH, 1500);
});

test("no file URL, credentials or signed access material enter report payload", () => {
  const report = validateResourceReport("inappropriate", "Contenido confuso");
  assert.equal(report.kind, "valid");
  if (report.kind !== "valid") return;
  assert.deepEqual(Object.keys(report.input).sort(), ["details", "reason"]);
});
