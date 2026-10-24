import assert from "node:assert/strict";
import test from "node:test";
import { organizationContentCursorRepeats } from "../apps/web/src/features/organizations/contentPagination.ts";

test("stops an organization page that returns its requested cursor", () => {
  assert.equal(
    organizationContentCursorRepeats(new Set(), "cursor-a", "cursor-a"),
    true,
  );
});

test("stops a post or event list that cycles to an earlier page", () => {
  assert.equal(
    organizationContentCursorRepeats(
      new Set(["cursor-a", "cursor-b"]),
      "cursor-c",
      "cursor-a",
    ),
    true,
  );
});

test("allows an unseen cursor and the final page", () => {
  const loaded = new Set(["cursor-a"]);
  assert.equal(
    organizationContentCursorRepeats(loaded, "cursor-a", "cursor-b"),
    false,
  );
  assert.equal(
    organizationContentCursorRepeats(loaded, "cursor-a", null),
    false,
  );
});
