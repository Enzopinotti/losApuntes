import assert from "node:assert/strict";
import test from "node:test";

import type { OrganizationReportInput } from "../src/features/organizations/organization-report-policy";
import {
  MobileOrganizationReportController,
  type OrganizationReportTargetType,
} from "../src/features/organizations/organization-report-controller";
import type { MobileOrganizationsApiContract } from "../src/features/organizations/organizations-api";
import { ApiRequestError } from "../src/services/api/client";

const response = { report: { id: "report-1", status: "pending" as const } };

const apiStub = (
  overrides: Partial<MobileOrganizationsApiContract> = {},
): MobileOrganizationsApiContract => ({
  search: async () => ({ items: [], nextCursor: null }),
  get: async () => {
    throw new Error("Unexpected organization read");
  },
  follow: async () => ({ following: true, changed: true }),
  unfollow: async () => ({ following: false, changed: true }),
  posts: async () => ({ items: [], nextCursor: null }),
  events: async () => ({ items: [], nextCursor: null }),
  reportPost: async () => response,
  reportEvent: async () => response,
  ...overrides,
});

const input: OrganizationReportInput = {
  reason: "spam",
  details: "Contenido repetido",
};

function target(type: OrganizationReportTargetType, id: string) {
  return {
    authorityKey: "session-a:organization:org-a",
    organizationId: "org-a",
    targetType: type,
    targetId: id,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function readySnapshot(controller: MobileOrganizationReportController) {
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") {
    throw new Error("Expected report controller to have a target");
  }
  return snapshot;
}

test("confirmed post reports keep the recorded reason and prevent duplicates", async () => {
  const calls: Array<{ postId: string; input: OrganizationReportInput }> = [];
  const controller = new MobileOrganizationReportController(
    apiStub({
      reportPost: async (_organizationId, postId, reportInput) => {
        calls.push({ postId, input: reportInput });
        return response;
      },
    }),
  );
  const scope = target("post", "post-a");
  controller.setTarget(
    scope.authorityKey,
    scope.organizationId,
    scope.targetType,
    scope.targetId,
  );

  assert.equal(
    await controller.submit(
      scope.authorityKey,
      scope.organizationId,
      scope.targetType,
      scope.targetId,
      input,
    ),
    true,
  );
  assert.deepEqual(calls, [{ postId: "post-a", input }]);
  assert.equal(readySnapshot(controller).outcome, "confirmed");
  assert.equal(readySnapshot(controller).reason, "spam");
  assert.equal(readySnapshot(controller).sending, false);
  assert.equal(
    await controller.submit(
      scope.authorityKey,
      scope.organizationId,
      scope.targetType,
      scope.targetId,
      input,
    ),
    false,
  );
  assert.equal(calls.length, 1);
});

test("ambiguous event reports are not blindly retried", async () => {
  let calls = 0;
  const controller = new MobileOrganizationReportController(
    apiStub({
      reportEvent: async () => {
        calls += 1;
        throw new ApiRequestError(
          "timeout",
          null,
          "REQUEST_TIMEOUT",
          "Request timed out",
        );
      },
    }),
  );
  const scope = target("event", "event-a");
  controller.setTarget(
    scope.authorityKey,
    scope.organizationId,
    scope.targetType,
    scope.targetId,
  );

  assert.equal(
    await controller.submit(
      scope.authorityKey,
      scope.organizationId,
      scope.targetType,
      scope.targetId,
      input,
    ),
    false,
  );
  assert.equal(readySnapshot(controller).outcome, "uncertain");
  assert.equal(readySnapshot(controller).sending, false);
  assert.equal(
    await controller.submit(
      scope.authorityKey,
      scope.organizationId,
      scope.targetType,
      scope.targetId,
      input,
    ),
    false,
  );
  assert.equal(calls, 1);
});

test("known rejection keeps the report form retryable", async () => {
  let calls = 0;
  const controller = new MobileOrganizationReportController(
    apiStub({
      reportPost: async () => {
        calls += 1;
        if (calls === 1) {
          throw new ApiRequestError(
            "validation",
            422,
            "REPORT_INVALID",
            "Report is invalid",
          );
        }
        return response;
      },
    }),
  );
  const scope = target("post", "post-a");
  controller.setTarget(
    scope.authorityKey,
    scope.organizationId,
    scope.targetType,
    scope.targetId,
  );

  await controller.submit(
    scope.authorityKey,
    scope.organizationId,
    scope.targetType,
    scope.targetId,
    input,
  );
  assert.equal(readySnapshot(controller).outcome, "none");
  assert.equal(readySnapshot(controller).failure?.kind, "error");

  assert.equal(
    await controller.submit(
      scope.authorityKey,
      scope.organizationId,
      scope.targetType,
      scope.targetId,
      input,
    ),
    true,
  );
  assert.equal(calls, 2);
});

test("a late report response cannot repaint a new content target", async () => {
  const pending = deferred<typeof response>();
  const controller = new MobileOrganizationReportController(
    apiStub({ reportPost: async () => pending.promise }),
  );
  const old = target("post", "post-a");
  controller.setTarget(
    old.authorityKey,
    old.organizationId,
    old.targetType,
    old.targetId,
  );
  const submission = controller.submit(
    old.authorityKey,
    old.organizationId,
    old.targetType,
    old.targetId,
    input,
  );

  controller.setTarget(old.authorityKey, old.organizationId, "post", "post-b");
  pending.resolve(response);
  await submission;

  assert.equal(readySnapshot(controller).targetId, "post-b");
  assert.equal(readySnapshot(controller).outcome, "none");
});
