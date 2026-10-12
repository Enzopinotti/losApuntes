import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ApiRequestError } from "../src/services/api/client";
import {
  MobileResourceReportController,
  type ResourceReportApi,
} from "../src/features/resources/resource-report-controller";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const accepted = { report: { id: "report-1", status: "pending" } };

test("report submission waits for server acknowledgement and prevents duplicates", async () => {
  const pending = deferred<typeof accepted>();
  const calls: string[] = [];
  const api: ResourceReportApi = {
    report: async (id, input) => {
      calls.push(`${id}:${input.reason}:${input.details ?? ""}`);
      return pending.promise;
    },
  };
  const controller = new MobileResourceReportController(api);
  controller.setScope("session-a", "resource-a");

  const sending = controller.submit(
    "session-a",
    "resource-a",
    "plagiarism",
    "  Copiado  ",
  );
  const inflight = controller.getSnapshot();
  assert.equal(inflight.kind, "ready");
  if (inflight.kind === "ready") {
    assert.equal(inflight.sending, true);
    assert.equal(inflight.outcome, "none");
  }
  assert.equal(
    await controller.submit("session-a", "resource-a", "spam", ""),
    false,
  );

  pending.resolve(accepted);
  assert.equal(await sending, true);
  assert.deepEqual(calls, ["resource-a:plagiarism:Copiado"]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.outcome, "confirmed");
    assert.equal(snapshot.sending, false);
  }
  assert.equal(
    await controller.submit("session-a", "resource-a", "spam", ""),
    false,
  );
});

test("invalid details and unknown authority never create a report", async () => {
  let calls = 0;
  const controller = new MobileResourceReportController({
    report: async () => {
      calls += 1;
      return accepted;
    },
  });
  controller.setScope("session-a", "resource-a");

  assert.equal(
    await controller.submit("session-b", "resource-a", "spam", ""),
    false,
  );
  assert.equal(
    await controller.submit("session-a", "wrong-resource", "spam", ""),
    false,
  );
  assert.equal(
    await controller.submit("session-a", "resource-a", "other", "ab"),
    false,
  );
  assert.equal(calls, 0);
});

test("definite validation failure remains retryable and does not claim success", async () => {
  let calls = 0;
  const controller = new MobileResourceReportController({
    report: async () => {
      calls += 1;
      if (calls === 1) {
        throw new ApiRequestError(
          "validation",
          422,
          "INVALID_REPORT",
          "Bad report",
        );
      }
      return accepted;
    },
  });
  controller.setScope("session-a", "resource-a");
  assert.equal(
    await controller.submit("session-a", "resource-a", "other", "Reason"),
    false,
  );
  const first = controller.getSnapshot();
  assert.equal(first.kind, "ready");
  if (first.kind === "ready") {
    assert.equal(first.outcome, "none");
    assert.equal(first.failure, "error");
  }

  assert.equal(
    await controller.submit("session-a", "resource-a", "other", "Reason"),
    true,
  );
  assert.equal(calls, 2);
});

test("ambiguous network failure cannot trigger a blind duplicate POST", async () => {
  let calls = 0;
  const controller = new MobileResourceReportController({
    report: async () => {
      calls += 1;
      throw new ApiRequestError("timeout", null, "TIMEOUT", "Timeout");
    },
  });
  controller.setScope("session-a", "resource-a");

  assert.equal(
    await controller.submit("session-a", "resource-a", "spam", ""),
    false,
  );
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.outcome, "uncertain");
    assert.equal(snapshot.failure, "timeout");
    assert.equal(snapshot.sending, false);
  }
  assert.equal(
    await controller.submit("session-a", "resource-a", "spam", ""),
    false,
  );
  assert.equal(calls, 1);
});

test("principal switch aborts pending report and ignores stale acknowledgement", async () => {
  const pending = deferred<typeof accepted>();
  let signal: AbortSignal | undefined;
  const controller = new MobileResourceReportController({
    report: async (_id, _input, nextSignal) => {
      signal = nextSignal;
      return pending.promise;
    },
  });
  controller.setScope("session-a", "resource-a");
  const sending = controller.submit("session-a", "resource-a", "spam", "");
  controller.setScope("session-b", "resource-b");
  pending.resolve(accepted);

  assert.equal(await sending, false);
  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), {
    kind: "ready",
    authorityKey: "session-b",
    resourceId: "resource-b",
    sending: false,
    outcome: "none",
    failure: null,
  });
});

test("background suspension blocks repeated POST with uncertain outcome", async () => {
  const pending = deferred<typeof accepted>();
  let calls = 0;
  let signal: AbortSignal | undefined;
  const controller = new MobileResourceReportController({
    report: async (_id, _input, nextSignal) => {
      calls += 1;
      signal = nextSignal;
      return pending.promise;
    },
  });
  controller.setScope("session-a", "resource-a");
  const sending = controller.submit("session-a", "resource-a", "other", "");
  controller.suspend("session-a");
  pending.resolve(accepted);

  assert.equal(await sending, false);
  assert.equal(signal?.aborted, true);
  controller.setScope("session-a", "resource-a");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind === "ready") {
    assert.equal(snapshot.outcome, "uncertain");
    assert.equal(snapshot.sending, false);
  }
  assert.equal(
    await controller.submit("session-a", "resource-a", "other", ""),
    false,
  );
  assert.equal(calls, 1);
});

test("report UI and transport target the existing API, without signed file URLs", () => {
  const detail = readFileSync(
    new URL(
      "../src/features/resources/resource-details-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const api = readFileSync(
    new URL(
      "../src/features/resources/resource-consumption-api.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(detail, /Reportar recurso/u);
  assert.match(detail, /RESOURCE_REPORT_REASONS\.map/u);
  assert.match(detail, /reportController\.submit\(/u);
  assert.match(detail, /Recibimos tu reporte/u);
  assert.match(detail, /No pudimos confirmar/u);
  assert.match(
    api,
    /\/resources\/\$\{encodeURIComponent\(resourceId\)\}\/reports/u,
  );
  assert.match(api, /method: "POST"/u);
});
