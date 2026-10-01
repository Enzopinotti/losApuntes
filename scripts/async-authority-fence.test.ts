import assert from "node:assert/strict";
import test from "node:test";

import { AsyncAuthorityFenceController } from "../apps/web/src/shared/asyncAuthorityFenceController.ts";

test("A -> B -> A never revives the original A ticket", () => {
  const fence = new AsyncAuthorityFenceController("A");
  const firstA = fence.begin();

  fence.syncScope("B");
  fence.abortActive();
  const b = fence.begin();

  assert.equal(fence.isCurrent(firstA), false);
  assert.equal(fence.isCurrent(b), true);

  fence.syncScope("A");
  fence.abortActive();
  const secondA = fence.begin();

  assert.equal(fence.isCurrent(firstA), false);
  assert.equal(fence.isCurrent(b), false);
  assert.equal(fence.isCurrent(secondA), true);
  assert.equal(fence.finish(secondA), true);
});

test("newer work owns completion and stale finally cannot release it", () => {
  const fence = new AsyncAuthorityFenceController("scope");
  const older = fence.begin();
  const newer = fence.begin();

  assert.equal(older.signal.aborted, true);
  assert.equal(fence.finish(older), false);
  assert.equal(fence.isCurrent(newer), true);
  assert.equal(fence.finish(newer), true);
});

test("invalidate revokes the active ticket immediately", () => {
  const fence = new AsyncAuthorityFenceController("scope");
  const ticket = fence.begin();

  fence.invalidate();

  assert.equal(ticket.signal.aborted, true);
  assert.equal(fence.isCurrent(ticket), false);
  assert.equal(fence.finish(ticket), false);
});
