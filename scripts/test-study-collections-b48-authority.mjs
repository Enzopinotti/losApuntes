import assert from "node:assert/strict";
import {
  scopedCollectionCreateAttempt,
  isConsistentCollectionPage,
  releaseScopedCollectionAction,
} from "../apps/web/src/features/study-collections/studyCollectionsAuthority.mjs";

const alice = "authenticated:alice:session-one";
const aliceNext = "authenticated:alice:session-two";
const bob = "authenticated:bob:session-one";
let number = 0;
const nextKey = () =>
  `11111111-1111-4111-8111-${String(++number).padStart(12, "0")}`;

const first = scopedCollectionCreateAttempt(
  null, alice, "Matemática", "Para el parcial", nextKey,
);
assert.equal(first.scope, alice);
assert.equal(number, 1);
assert.strictEqual(
  scopedCollectionCreateAttempt(
    first, alice, "Matemática", "Para el parcial", nextKey,
  ),
  first,
  "A network retry with unchanged content must reuse the same key",
);
assert.equal(number, 1);
assert.notEqual(
  scopedCollectionCreateAttempt(
    first, alice, "Otra materia", "Para el parcial", nextKey,
  ).key,
  first.key,
  "Changing the title requires a fresh idempotency key",
);
assert.notEqual(
  scopedCollectionCreateAttempt(
    first, alice, "Matemática", "Otras notas", nextKey,
  ).key,
  first.key,
  "Changing the description requires a fresh idempotency key",
);
assert.notEqual(
  scopedCollectionCreateAttempt(
    first, aliceNext, "Matemática", "Para el parcial", nextKey,
  ).key,
  first.key,
  "A new session cannot reuse a prior idempotency key",
);
assert.notEqual(
  scopedCollectionCreateAttempt(
    first, bob, "Matemática", "Para el parcial", nextKey,
  ).key,
  first.key,
  "Another account cannot reuse this page's key",
);
assert.notEqual(
  scopedCollectionCreateAttempt(
    first, alice, "Matemática\\nPara el parcial", "", nextKey,
  ).fingerprint,
  first.fingerprint,
);
assert.throws(() =>
  scopedCollectionCreateAttempt(
    first, "anonymous:none:none", "T", "", nextKey,
  ),
);
assert.throws(() =>
  scopedCollectionCreateAttempt(
    null, alice, "T", "", () => 0,
  ),
);

for (const [name, values, expected] of [
  ["first page", [1, 1, null, false], true],
  ["inconsistent fresh response", [2, 1, null, false], false],
  ["appended page", [3, 3, 3, true], true],
  ["stale append", [4, 4, 3, true], false],
  ["missing append authority", [4, 4, null, true], false],
  ["invalid header", [0, 1, null, false], false],
  ["invalid page", [1, Number.NaN, null, false], false],
  ["invalid revision type", [1.5, 1.5, null, false], false],
]) {
  const actual = isConsistentCollectionPage(...values);
  assert.equal(actual, expected, name);
}

const firstLease = { scope: alice, marker: "request-A" };
const laterLease = { scope: bob, marker: "request-B" };
assert.equal(
  releaseScopedCollectionAction(firstLease, firstLease),
  null,
  "Current completion releases its own lock",
);
assert.strictEqual(
  releaseScopedCollectionAction(laterLease, firstLease),
  laterLease,
  "Late completion MUST NOT release a newer request's lock",
);
assert.equal(releaseScopedCollectionAction(null, firstLease), null);

console.log("B48 scoped collection authority: 22 runtime assertions PASS");
