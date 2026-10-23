import assert from "node:assert/strict";
import test from "node:test";
import {
  appendUniqueItems,
  questionCursorRepeats,
} from "../apps/web/src/features/community/questionPagination.ts";

test("detects repeated current and previously used question cursors", () => {
  assert.equal(questionCursorRepeats(new Set(), "cursor-a", "cursor-a"), true);
  assert.equal(
    questionCursorRepeats(
      new Set(["cursor-a", "cursor-b"]),
      "cursor-c",
      "cursor-a",
    ),
    true,
  );
});

test("allows a new question cursor and the final page", () => {
  const loaded = new Set(["cursor-a"]);
  assert.equal(questionCursorRepeats(loaded, "cursor-a", "cursor-b"), false);
  assert.equal(questionCursorRepeats(loaded, "cursor-a", null), false);
});

test("appends question pages without duplicating item ids", () => {
  assert.deepEqual(
    appendUniqueItems(
      [
        { id: "question-a", title: "A" },
        { id: "question-b", title: "B" },
      ],
      [
        { id: "question-b", title: "B updated" },
        { id: "question-c", title: "C" },
      ],
    ),
    [
      { id: "question-a", title: "A" },
      { id: "question-b", title: "B updated" },
      { id: "question-c", title: "C" },
    ],
  );
});
