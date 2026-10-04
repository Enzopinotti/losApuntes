import assert from "node:assert/strict";
import { AsyncAuthorityFence } from "../apps/web/src/shared/asyncAuthorityFence.ts";

const fence = new AsyncAuthorityFence("A");
const firstA = fence.begin("A");

fence.setScope("B");
const currentB = fence.begin("B");

assert.equal(firstA.signal.aborted, true);
assert.equal(fence.isCurrent(firstA), false);
assert.equal(fence.isCurrent(currentB), true);
assert.equal(fence.finish(firstA), false);
assert.equal(
  fence.isCurrent(currentB),
  true,
  "stale finally from A must not release B ownership",
);

fence.setScope("A");
const secondA = fence.begin("A");

assert.equal(fence.isCurrent(firstA), false, "A → B → A must not revive old A");
assert.equal(fence.isCurrent(currentB), false);
assert.equal(fence.isCurrent(secondA), true);
assert.equal(fence.finish(firstA), false);
assert.equal(fence.isCurrent(secondA), true);

fence.setScope("B");
const latestB = fence.begin("B");
const staleCallbackTicket = fence.begin("A");

assert.equal(staleCallbackTicket.signal.aborted, true);
assert.equal(
  fence.isCurrent(latestB),
  true,
  "a stale callback must not supersede the current scope operation",
);

fence.invalidate();
assert.equal(latestB.signal.aborted, true);
assert.equal(fence.isCurrent(latestB), false);

fence.dispose();
const afterDispose = fence.begin("B");
assert.equal(afterDispose.signal.aborted, true);
assert.equal(fence.isCurrent(afterDispose), false);
fence.setScope("A");
const afterDisposedScopeChange = fence.begin("A");
assert.equal(afterDisposedScopeChange.signal.aborted, true);
assert.equal(
  fence.isCurrent(afterDisposedScopeChange),
  false,
  "disposed fences must never regain request ownership",
);

console.log("PASS Web async authority ownership A → B → A");
