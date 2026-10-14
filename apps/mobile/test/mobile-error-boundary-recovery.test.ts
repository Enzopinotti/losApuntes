import assert from "node:assert/strict";
import test from "node:test";

import { recoverMobileErrorBoundaryOnRouteChange } from "../src/features/observability/mobile-error-boundary-recovery";

test("same-route rerenders keep the failed fallback visible", () => {
  const crashed = { failed: true, routeKey: "/resources/first" };

  assert.equal(
    recoverMobileErrorBoundaryOnRouteChange("/resources/first", crashed),
    null,
  );
  assert.deepEqual(crashed, {
    failed: true,
    routeKey: "/resources/first",
  });
});

test("navigating to another resource clears the previous failure", () => {
  const crashed = { failed: true, routeKey: "/resources/first" };
  const recovered = recoverMobileErrorBoundaryOnRouteChange(
    "/resources/second",
    crashed,
  );

  assert.deepEqual(recovered, {
    failed: false,
    routeKey: "/resources/second",
  });
  assert.ok(recovered);
  assert.equal(
    recoverMobileErrorBoundaryOnRouteChange("/resources/second", recovered),
    null,
  );
});

test("healthy navigation never invents an error", () => {
  assert.deepEqual(
    recoverMobileErrorBoundaryOnRouteChange("/search", {
      failed: false,
      routeKey: "/home",
    }),
    { failed: false, routeKey: "/search" },
  );
});
