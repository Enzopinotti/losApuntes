import assert from "node:assert/strict";
import test from "node:test";

import {
  ORGANIZATION_REPORT_DETAILS_MAX_LENGTH,
  ORGANIZATION_REPORT_REASONS,
  validateOrganizationReport,
} from "../src/features/organizations/organization-report-policy";

test("organization report reasons match the server moderation vocabulary", () => {
  assert.deepEqual(
    ORGANIZATION_REPORT_REASONS.map((option) => option.value),
    [
      "spam",
      "impersonation",
      "misinformation",
      "harassment",
      "inappropriate",
      "other",
    ],
  );
});

test("report details are normalized and optional", () => {
  assert.deepEqual(validateOrganizationReport("spam", "  repetido  "), {
    kind: "valid",
    input: { reason: "spam", details: "repetido" },
  });
  assert.deepEqual(validateOrganizationReport("other", ""), {
    kind: "valid",
    input: { reason: "other" },
  });
});

test("report policy enforces the reason and details bounds", () => {
  assert.equal(validateOrganizationReport(null, "").kind, "invalid");
  assert.equal(validateOrganizationReport("spam", "ab").kind, "invalid");
  assert.equal(
    validateOrganizationReport(
      "spam",
      "x".repeat(ORGANIZATION_REPORT_DETAILS_MAX_LENGTH + 1),
    ).kind,
    "invalid",
  );
});
