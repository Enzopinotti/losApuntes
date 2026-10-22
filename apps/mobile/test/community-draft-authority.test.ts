import assert from "node:assert/strict";
import test from "node:test";

import { communityDraftAuthorityTransition } from "../src/features/community/community-controller";

test("community drafts keep their last authority through transient gates", () => {
  assert.deepEqual(communityDraftAuthorityTransition(null, null), {
    authorityKey: null,
    resetDraft: false,
  });
  assert.deepEqual(
    communityDraftAuthorityTransition("user-a:session-a:context-a", null),
    { authorityKey: "user-a:session-a:context-a", resetDraft: false },
  );
  assert.deepEqual(
    communityDraftAuthorityTransition(null, "user-a:session-a:context-a"),
    { authorityKey: "user-a:session-a:context-a", resetDraft: false },
  );
});

test("community drafts reset when a different authority becomes ready", () => {
  assert.deepEqual(
    communityDraftAuthorityTransition(
      "user-a:session-a:context-a",
      "user-a:session-a:context-a",
    ),
    { authorityKey: "user-a:session-a:context-a", resetDraft: false },
  );
  assert.deepEqual(
    communityDraftAuthorityTransition(
      "user-a:session-a:context-a",
      "user-b:session-b:context-b",
    ),
    { authorityKey: "user-b:session-b:context-b", resetDraft: true },
  );
});
