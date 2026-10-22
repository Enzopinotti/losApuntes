import assert from "node:assert/strict";
import test from "node:test";

import { persistentStudyCollectionsVisible } from "../src/features/study-collections/persistent-collections-flag";

test("mobile persistent collection discoverability fails closed", () => {
  assert.equal(persistentStudyCollectionsVisible(undefined), false);
  assert.equal(persistentStudyCollectionsVisible("false"), false);
  assert.equal(persistentStudyCollectionsVisible("true"), true);
});
