import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyStudyTaskLabels } from "../apps/web/src/features/study/study-task-verification.mjs";
import { emptyStudySession } from "../apps/web/src/features/study/study-session-plan.mjs";

const subjectId = "11111111-1111-4111-8111-111111111111";
const tasks = Array.from({ length: 24 }, (_, index) => ({
  kind: index % 2 === 0 ? "question" : "resource",
  id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
  minutes: 5,
  done: false,
}));
const plan = { ...emptyStudySession(subjectId), tasks };

let active = 0;
let peak = 0;
const visited = [];
const labels = await verifyStudyTaskLabels(
  plan,
  async (task) => {
    active += 1;
    peak = Math.max(peak, active);
    visited.push(task.id);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return "Verificado:" + task.id;
  },
  () => true,
);
assert.equal(
  peak,
  4,
  "24 activities must use at most four parallel verifications",
);
assert.equal(active, 0);
assert.equal(visited.length, 24);
assert.equal(new Set(visited).size, 24);
assert.equal(Object.keys(labels).length, 24);
for (const task of tasks) {
  assert.equal(labels[task.kind + ":" + task.id], "Verificado:" + task.id);
}

// One revoked item stays unavailable instead of being misrepresented as a label.
const revoked = tasks[7];
const access = await verifyStudyTaskLabels(
  plan,
  async (task) => (task.id === revoked.id ? null : task.id),
  () => true,
);
assert.equal(access[revoked.kind + ":" + revoked.id], null);
assert.equal(Object.keys(access).length, 24);

// An authority change stops further work and never returns partial results.
let authorized = true;
let launched = 0;
const stale = await verifyStudyTaskLabels(
  plan,
  async () => {
    launched += 1;
    authorized = false;
    return "stale";
  },
  () => authorized,
);
assert.equal(stale, null);
assert.ok(launched <= 4);

// Network/auth failure is propagated, not downgraded to an unavailable title.
await assert.rejects(
  verifyStudyTaskLabels(
    plan,
    async () => {
      throw new Error("HTTP 401");
    },
    () => true,
  ),
  /HTTP 401/u,
);
await assert.rejects(
  verifyStudyTaskLabels(
    plan,
    async () => 123,
    () => true,
  ),
  /STUDY_TASK_VERIFICATION_INVALID/u,
);
await assert.rejects(
  verifyStudyTaskLabels(
    { ...plan, subjectId: "untrusted" },
    async () => "ok",
    () => true,
  ),
  /STUDY_SESSION_INVALID/u,
);
assert.deepEqual(
  await verifyStudyTaskLabels(
    emptyStudySession(subjectId),
    async () => "unused",
    () => true,
  ),
  {},
);

const runner = readFileSync(
  new URL("../apps/web/src/pages/StudyRunner.tsx", import.meta.url),
  "utf8",
);
assert.match(runner, /verifyStudyTaskLabels\(/u);
assert.match(runner, /verifiedTaskLabel\(plan, task, ticket\.signal\)/u);
assert.match(runner, /\(\) => loadCurrent\(ticket\)/u);
assert.match(runner, /if \(!labels \|\| !loadCurrent\(ticket\)\) return;/u);
assert.doesNotMatch(runner, /localStorage|indexedDB|sessionStorage/iu);
console.log(
  "B72 verified study-task batch: 24 IDs, <=4 in flight, failure and stale fencing PASS",
);
