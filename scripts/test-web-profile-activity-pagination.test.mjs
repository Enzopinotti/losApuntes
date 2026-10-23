import assert from "node:assert/strict";
import test from "node:test";
import { activityCursorRepeats } from "../apps/web/src/features/profile/activityPagination.ts";

test("detects a cursor repeated by the page currently being loaded", () => {
  assert.equal(activityCursorRepeats(new Set(), "cursor-a", "cursor-a"), true);
});

test("detects a cycle back to a cursor loaded earlier in the session", () => {
  assert.equal(
    activityCursorRepeats(
      new Set(["cursor-a", "cursor-b"]),
      "cursor-c",
      "cursor-a",
    ),
    true,
  );
});

test("allows a new cursor so pagination can continue", () => {
  assert.equal(
    activityCursorRepeats(new Set(["cursor-a"]), "cursor-a", "cursor-b"),
    false,
  );
});

test("does not treat the end of pagination as a cycle", () => {
  assert.equal(
    activityCursorRepeats(new Set(["cursor-a"]), "cursor-a", null),
    false,
  );
});
