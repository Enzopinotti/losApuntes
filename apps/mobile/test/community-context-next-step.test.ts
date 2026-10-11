import assert from "node:assert/strict";
import test from "node:test";

import {
  ACADEMIC_CONTEXT_HOME_ROUTE,
  communityQuestionNextStep,
} from "../src/features/community/community-context-next-step";
import { ACADEMIC_CONTEXT_HOME_ROUTE as SEARCH_CONTEXT_HOME_ROUTE } from "../src/features/search/search-contextual-discovery-copy";

test("Q&A uses the existing Home academic selector route", () => {
  assert.equal(ACADEMIC_CONTEXT_HOME_ROUTE, "/(tabs)/home");
  assert.equal(ACADEMIC_CONTEXT_HOME_ROUTE, SEARCH_CONTEXT_HOME_ROUTE);
});

test("only a ready server-confirmed absence of current subject offers configuration", () => {
  assert.equal(communityQuestionNextStep("ready", "all"), "configure");
  assert.equal(communityQuestionNextStep("ready", "subject"), "compose");
  assert.equal(communityQuestionNextStep("ready", "unresolved"), "revalidate");
});

test("transient and restricted authority gates never offer a setup or mutation action", () => {
  for (const gate of [
    "auth_required",
    "restricted",
    "blurred",
    "suspended",
    "revalidating",
    "context_loading",
    "context_unavailable",
    "offline",
    "timeout",
    "server_unavailable",
    "authority_mismatch",
    "error",
  ] as const) {
    for (const scopeKind of ["all", "subject", "unresolved"] as const) {
      assert.equal(
        communityQuestionNextStep(gate, scopeKind),
        "gated",
        `${gate}/${scopeKind}`,
      );
    }
  }
});
