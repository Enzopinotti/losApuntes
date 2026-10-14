import assert from "node:assert/strict";
import test from "node:test";

import { detailFailureKind } from "../src/features/search/use-fenced-detail";
import { ApiRequestError } from "../src/services/api/client";

test("fenced details distinguish revoked access from unavailable content", () => {
  assert.equal(
    detailFailureKind(
      new ApiRequestError("forbidden", 403, "RESOURCE_FORBIDDEN", "denied"),
    ),
    "forbidden",
  );
  assert.equal(
    detailFailureKind(
      new ApiRequestError("unexpected", 404, "RESOURCE_NOT_FOUND", "missing"),
    ),
    "not_found",
  );
  assert.equal(
    detailFailureKind(
      new ApiRequestError("gone", 410, "RESOURCE_GONE", "gone"),
    ),
    "not_found",
  );
});

test("fenced detail failures preserve network and account restriction states", () => {
  assert.equal(
    detailFailureKind(
      new ApiRequestError("offline", null, "NETWORK_UNAVAILABLE", "offline"),
    ),
    "offline",
  );
  assert.equal(
    detailFailureKind(
      new ApiRequestError("timeout", null, "REQUEST_TIMEOUT", "timeout"),
    ),
    "timeout",
  );
  assert.equal(
    detailFailureKind(
      new ApiRequestError(
        "server_unavailable",
        503,
        "SERVER_UNAVAILABLE",
        "unavailable",
      ),
    ),
    "server_unavailable",
  );
  assert.equal(
    detailFailureKind(
      new ApiRequestError("forbidden", 403, "ACCOUNT_RESTRICTED", "restricted"),
    ),
    "restricted",
  );
});
