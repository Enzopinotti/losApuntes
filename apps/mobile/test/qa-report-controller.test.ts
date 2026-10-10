import assert from "node:assert/strict";
import test from "node:test";

import type {
  CreateQaReportInput,
  CreateQaReportResponse,
} from "@losapuntes/contracts/social-qa";

import type { CommunityQaReportsApi } from "../src/features/community/community-api";
import {
  normalizeQaReportInput,
  QaReportController,
} from "../src/features/community/qa-report-controller";
import { ApiRequestError } from "../src/services/api/client";

function response(
  targetType: "question" | "answer",
  targetId: string,
  reason: CreateQaReportInput["reason"] = "spam",
): CreateQaReportResponse {
  return {
    report: {
      id: `report-${targetId}`,
      targetType,
      targetId,
      reason,
      status: "pending",
      createdAt: "2026-10-10T12:00:00.000Z",
    },
  };
}

function reportApi(
  overrides: Partial<CommunityQaReportsApi> = {},
): CommunityQaReportsApi {
  return {
    reportQuestion: async () => response("question", "question-a"),
    reportAnswer: async () => response("answer", "answer-a"),
    ...overrides,
  };
}

test("normalizes optional details and enforces server detail bounds", () => {
  assert.deepEqual(normalizeQaReportInput({ reason: "spam", details: "  " }), {
    reason: "spam",
  });
  assert.deepEqual(
    normalizeQaReportInput({ reason: "other", details: "  texto claro  " }),
    { reason: "other", details: "texto claro" },
  );
  assert.equal(
    normalizeQaReportInput({ reason: "other", details: "ab" }),
    null,
  );
  assert.equal(
    normalizeQaReportInput({ reason: "other", details: "x".repeat(1501) }),
    null,
  );
});

test("dispatches question and answer reports and publishes the canonical response", async () => {
  const calls: string[] = [];
  const controller = new QaReportController(
    reportApi({
      reportQuestion: async (id, input) => {
        calls.push(`question:${id}:${input.reason}`);
        return response("question", id, "plagiarism");
      },
      reportAnswer: async (id, input) => {
        calls.push(`answer:${id}:${input.reason}`);
        return response("answer", id, input.reason);
      },
    }),
  );

  controller.setAuthority("session-a", "question", "question-a");
  await controller.submit("session-a", {
    reason: "spam",
    details: "  ejemplo  ",
  });
  assert.deepEqual(controller.getSnapshot(), {
    kind: "ready",
    authorityKey: "session-a",
    targetType: "question",
    targetId: "question-a",
    busy: false,
    report: response("question", "question-a", "plagiarism").report,
    failure: null,
  });

  controller.setAuthority("session-a", "answer", "answer-a");
  await controller.submit("session-a", { reason: "harassment" });
  assert.deepEqual(calls, [
    "question:question-a:spam",
    "answer:answer-a:harassment",
  ]);
  assert.equal(controller.getSnapshot().kind, "ready");
});

test("blocks concurrent and confirmed duplicate submits", async () => {
  let resolve!: (value: CreateQaReportResponse) => void;
  let calls = 0;
  const pending = new Promise<CreateQaReportResponse>((done) => {
    resolve = done;
  });
  const controller = new QaReportController(
    reportApi({
      reportQuestion: async () => {
        calls += 1;
        return pending;
      },
    }),
  );
  controller.setAuthority("session-a", "question", "question-a");

  const input = { reason: "spam" } as const;
  const first = controller.submit("session-a", input);
  await controller.submit("session-a", input);
  assert.equal(calls, 1);
  resolve(response("question", "question-a"));
  await first;
  await controller.submit("session-a", input);
  assert.equal(calls, 1);
});

test("ambiguous timeout can retry through the idempotent API and keeps canonical server data", async () => {
  let calls = 0;
  const canonical = response("question", "question-a", "other");
  const controller = new QaReportController(
    reportApi({
      reportQuestion: async () => {
        calls += 1;
        if (calls === 1) {
          throw new ApiRequestError(
            "timeout",
            null,
            "REQUEST_TIMEOUT",
            "timeout",
          );
        }
        return canonical;
      },
    }),
  );
  controller.setAuthority("session-a", "question", "question-a");
  const input = { reason: "spam", details: "posible duplicado" } as const;

  await controller.submit("session-a", input);
  const failedSnapshot = controller.getSnapshot();
  assert.equal(
    failedSnapshot.kind === "ready" ? failedSnapshot.failure?.kind : undefined,
    "timeout",
  );
  await controller.submit("session-a", input);
  assert.equal(calls, 2);
  const retriedSnapshot = controller.getSnapshot();
  assert.deepEqual(
    retriedSnapshot.kind === "ready" ? retriedSnapshot.report : undefined,
    canonical.report,
  );
});

test("fences a delayed response after authority or target changes", async () => {
  let resolve!: (value: CreateQaReportResponse) => void;
  let signal: AbortSignal | undefined;
  const pending = new Promise<CreateQaReportResponse>((done) => {
    resolve = done;
  });
  const controller = new QaReportController(
    reportApi({
      reportQuestion: async (_id, _input, requestSignal) => {
        signal = requestSignal;
        return pending;
      },
    }),
  );
  controller.setAuthority("session-a", "question", "question-a");
  const submission = controller.submit("session-a", { reason: "spam" });
  controller.setAuthority("session-b", "question", "question-a");
  assert.equal(signal?.aborted, true);
  resolve(response("question", "question-a"));
  await submission;
  const switchedSnapshot = controller.getSnapshot();
  assert.equal(
    switchedSnapshot.kind === "ready"
      ? switchedSnapshot.authorityKey
      : undefined,
    "session-b",
  );
  assert.equal(
    switchedSnapshot.kind === "ready" ? switchedSnapshot.report : undefined,
    null,
  );
});
