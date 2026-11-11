import assert from "node:assert/strict";
import test from "node:test";

import { OrganizationReportController } from "../apps/web/src/features/organizations/organization-report-controller.ts";
import {
  ORGANIZATION_REPORT_DETAILS_MAX_LENGTH,
  ORGANIZATION_REPORT_REASONS,
  validateOrganizationReport,
} from "../apps/web/src/features/organizations/organization-report-policy.ts";

const response = { report: { id: "report-1", status: "pending" } };
const input = { reason: "spam", details: "Contenido repetido" };

function apiStub(overrides = {}) {
  return {
    reportPost: async () => response,
    reportEvent: async () => response,
    ...overrides,
  };
}

function readySnapshot(controller) {
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") {
    throw new Error("Expected report controller to have a target");
  }
  return snapshot;
}

function setPostTarget(controller, targetId = "post-a") {
  controller.setTarget("session-a:org-a", "org-a", "post", targetId);
}

test("report reasons and optional detail lengths match the API policy", () => {
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
  assert.deepEqual(validateOrganizationReport("other", "   "), {
    kind: "valid",
    input: { reason: "other" },
  });
  assert.deepEqual(validateOrganizationReport("spam", "  repetido  "), {
    kind: "valid",
    input: { reason: "spam", details: "repetido" },
  });
  assert.equal(validateOrganizationReport("spam", "ab").kind, "invalid");
  assert.equal(
    validateOrganizationReport(
      "spam",
      "x".repeat(ORGANIZATION_REPORT_DETAILS_MAX_LENGTH + 1),
    ).kind,
    "invalid",
  );
});

test("a confirmed post report records its reason and blocks duplicates", async () => {
  const calls = [];
  const controller = new OrganizationReportController(
    apiStub({
      reportPost: async (...args) => {
        calls.push(args);
        return response;
      },
    }),
  );
  setPostTarget(controller);

  assert.equal(
    await controller.submit(
      "session-a:org-a",
      "org-a",
      "post",
      "post-a",
      input.reason,
      input.details,
    ),
    true,
  );
  assert.equal(readySnapshot(controller).outcome, "confirmed");
  assert.equal(readySnapshot(controller).reason, "spam");
  assert.equal(calls.length, 1);
  assert.equal(
    await controller.submit(
      "session-a:org-a",
      "org-a",
      "post",
      "post-a",
      input.reason,
      input.details,
    ),
    false,
  );
  assert.equal(calls.length, 1);
});

test("an ambiguous timeout blocks an automatic duplicate report", async () => {
  let calls = 0;
  const controller = new OrganizationReportController(
    apiStub({
      reportEvent: async () => {
        calls += 1;
        throw Object.assign(new Error("timeout"), { status: 0 });
      },
    }),
  );
  controller.setTarget("session-a:org-a", "org-a", "event", "event-a");

  assert.equal(
    await controller.submit(
      "session-a:org-a",
      "org-a",
      "event",
      "event-a",
      input.reason,
      input.details,
    ),
    false,
  );
  assert.equal(readySnapshot(controller).outcome, "uncertain");
  assert.equal(
    await controller.submit(
      "session-a:org-a",
      "org-a",
      "event",
      "event-a",
      input.reason,
      input.details,
    ),
    false,
  );
  assert.equal(calls, 1);
});

test("a definite validation rejection remains retryable", async () => {
  let calls = 0;
  const controller = new OrganizationReportController(
    apiStub({
      reportPost: async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error("invalid report"), { status: 422 });
        }
        return response;
      },
    }),
  );
  setPostTarget(controller);

  await controller.submit(
    "session-a:org-a",
    "org-a",
    "post",
    "post-a",
    input.reason,
    input.details,
  );
  assert.equal(readySnapshot(controller).outcome, "none");
  assert.equal(
    await controller.submit(
      "session-a:org-a",
      "org-a",
      "post",
      "post-a",
      input.reason,
      input.details,
    ),
    true,
  );
  assert.equal(calls, 2);
});

test("an invalid success body is treated as an uncertain submission", async () => {
  let calls = 0;
  const controller = new OrganizationReportController(
    apiStub({
      reportPost: async () => {
        calls += 1;
        return { report: { id: "", status: "rejected" } };
      },
    }),
  );
  setPostTarget(controller);

  assert.equal(
    await controller.submit(
      "session-a:org-a",
      "org-a",
      "post",
      "post-a",
      input.reason,
      input.details,
    ),
    false,
  );
  assert.equal(readySnapshot(controller).outcome, "uncertain");
  assert.equal(
    await controller.submit(
      "session-a:org-a",
      "org-a",
      "post",
      "post-a",
      input.reason,
      input.details,
    ),
    false,
  );
  assert.equal(calls, 1);
});

test("a delayed acknowledgement cannot mark a different content item", async () => {
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const controller = new OrganizationReportController(
    apiStub({ reportPost: async () => pending }),
  );
  setPostTarget(controller);
  const submission = controller.submit(
    "session-a:org-a",
    "org-a",
    "post",
    "post-a",
    input.reason,
    input.details,
  );

  setPostTarget(controller, "post-b");
  resolve(response);
  await submission;

  assert.equal(readySnapshot(controller).targetId, "post-b");
  assert.equal(readySnapshot(controller).outcome, "none");
});
