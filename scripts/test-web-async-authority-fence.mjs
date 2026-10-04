import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AsyncAuthorityFence } from "../apps/web/src/shared/asyncAuthorityFence.ts";

const hook = await readFile(
  new URL("../apps/web/src/shared/useAsyncAuthorityFence.ts", import.meta.url),
  "utf8",
);
assert.match(hook, /fence\.invalidate\(\)/u);
assert.doesNotMatch(hook, /fence\.dispose\(\)/u);

const strictModeReplayFence = new AsyncAuthorityFence("strict-mode-replay");
const firstMount = strictModeReplayFence.begin("strict-mode-replay");
strictModeReplayFence.invalidate();
assert.equal(firstMount.signal.aborted, true);

const replayedMount = strictModeReplayFence.begin("strict-mode-replay");
assert.equal(
  strictModeReplayFence.isCurrent(replayedMount),
  true,
  "effect replay cleanup must invalidate old work without disabling the next setup",
);
assert.equal(strictModeReplayFence.finish(replayedMount), true);

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
