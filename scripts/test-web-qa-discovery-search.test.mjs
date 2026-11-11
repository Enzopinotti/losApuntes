import assert from "node:assert/strict";
import test from "node:test";
import {
  questionDiscoveryClearParams,
  questionDiscoveryFiltersFromParams,
  questionDiscoveryListHref,
  questionDiscoverySearchParams,
} from "../apps/web/src/features/community/qa-discovery-search.mjs";

const subjectId = "123e4567-e89b-42d3-a456-426614174000";
const params = (value) => new URLSearchParams(value);

test("empty filters represent a public discovery list", () => {
  assert.deepEqual(questionDiscoveryFiltersFromParams(params("")), {
    q: "",
    status: "",
  });
  assert.equal(questionDiscoveryListHref(params("")), "/questions");
});

test("shared search restores exactly the canonical applied query and state", () => {
  const parsed = questionDiscoveryFiltersFromParams(
    params("q=%20%20Algebra%202%20%20&status=open"),
  );
  assert.deepEqual(parsed, { q: "Algebra 2", status: "open" });
  assert.deepEqual(
    questionDiscoveryFiltersFromParams(params("q=integrales&status=closed")),
    { q: "integrales", status: "closed" },
  );
});

test("invalid or duplicated search filters fail closed", () => {
  for (const raw of [
    "q=", "q=a", "q=%20%20", "q=" + "a".repeat(121),
    "q=prueba&q=prueba", "status=", "status=unknown",
    "status=OPEN", "status=open&status=open", "q=hola&status=x",
  ]) {
    assert.equal(
      questionDiscoveryFiltersFromParams(params(raw)),
      null,
      `invalid URL must not launch an unfiltered query: ${raw}`,
    );
    assert.equal(questionDiscoveryListHref(params(raw)), null);
  }
  assert.deepEqual(
    questionDiscoveryFiltersFromParams(params("q=" + "x".repeat(120))),
    { q: "x".repeat(120), status: "" },
  );
});

test("submit canonicalizes drafts without discarding subject and removes stale detail", () => {
  const current = params(`subjectId=${subjectId}&id=question-1&q=old&status=open`);
  const updated = questionDiscoverySearchParams(current, "  matrices  ", "closed");
  assert.ok(updated);
  assert.equal(updated.get("subjectId"), subjectId);
  assert.equal(updated.get("q"), "matrices");
  assert.equal(updated.get("status"), "closed");
  assert.equal(updated.has("id"), false);
  assert.equal(questionDiscoverySearchParams(current, "x", "open"), null);
  assert.equal(questionDiscoverySearchParams(current, "hola", "pending"), null);
});

test("clearing a search preserves subject while removing text, state and stale detail", () => {
  const cleared = questionDiscoveryClearParams(
    params(`subjectId=${subjectId}&q=matrices&status=closed&id=question-1`),
  );
  assert.equal(cleared.toString(), `subjectId=${subjectId}`);
  assert.equal(questionDiscoveryListHref(cleared), `/questions?subjectId=${subjectId}`);
});

test("share includes public canonical filters only, never detail or private state", () => {
  const url = questionDiscoveryListHref(
    params(`id=private-question&cursor=opaque&token=secret&subjectId=${subjectId}&q=algebra&status=closed`),
  );
  assert.equal(
    url,
    `/questions?subjectId=${subjectId}&q=algebra&status=closed`,
  );
  assert.equal(questionDiscoveryListHref(params("subjectId=invalid&q=matrices")), null);
  assert.equal(
    questionDiscoveryListHref(params(`subjectId=${subjectId}&subjectId=${subjectId}`)),
    null,
  );
});

test("query normalization is URL-encoded and never changes search authority", () => {
  const built = questionDiscoverySearchParams(params(""), "  arte & ciencia  ", "open");
  assert.equal(questionDiscoveryListHref(built), "/questions?q=arte+%26+ciencia&status=open");
  assert.equal(questionDiscoveryListHref(params("q=arte+%26+ciencia&status=open")), "/questions?q=arte+%26+ciencia&status=open");
});
