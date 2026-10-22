import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the question composer clears its private draft on an authority change", () => {
  const screen = readFileSync(
    new URL("../src/features/community/community-screens.tsx", import.meta.url),
    "utf8",
  );

  assert.match(screen, /const draftAuthorityKeyRef = useRef\(authorityKey\);/u);
  assert.match(
    screen,
    /communityDraftAuthorityTransition\(\s*draftAuthorityKeyRef\.current,\s*authorityKey,?\s*\)/u,
  );
  assert.match(
    screen,
    /draftAuthorityKeyRef\.current = draftAuthorityTransition\.authorityKey;/u,
  );
  assert.match(
    screen,
    /if\s*\(\s*draftAuthorityTransition\.resetDraft\s*\|\|\s*pendingQuestionAuthorityChanged\s*\)\s*\{[\s\S]*?setFailure\(null\);[\s\S]*?setFailureCode\(null\);[\s\S]*?setTitle\(""\);[\s\S]*?setBody\(""\);/u,
  );
});
