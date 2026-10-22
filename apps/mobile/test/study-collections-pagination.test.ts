import assert from "node:assert/strict";
import test from "node:test";

import { recordStudyCollectionPageCursor } from "../src/features/study-collections/study-collections-pagination";

test("study collection pages stop self-repeats and cycles", () => {
  const history = new Set<string>();

  assert.equal(
    recordStudyCollectionPageCursor(history, "cursor-a", "cursor-b"),
    false,
  );
  assert.equal(
    recordStudyCollectionPageCursor(history, "cursor-b", "cursor-c"),
    false,
  );
  assert.equal(
    recordStudyCollectionPageCursor(history, "cursor-c", "cursor-a"),
    true,
  );
  assert.equal(
    recordStudyCollectionPageCursor(new Set(), "same", "same"),
    true,
  );
});

test("study collection list and detail histories remain independent", () => {
  const collections = new Set<string>();
  const resources = new Set<string>();

  assert.equal(
    recordStudyCollectionPageCursor(
      collections,
      "collection-page-a",
      "collection-page-b",
    ),
    false,
  );
  assert.equal(
    recordStudyCollectionPageCursor(
      resources,
      "resource-page-a",
      "collection-page-a",
    ),
    false,
  );
});
