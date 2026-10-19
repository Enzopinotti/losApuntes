import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPrivateRecallReport,
  RECALL_REPORT_FORMAT,
  RECALL_REPORT_VERSION,
} from "../apps/web/src/features/study/study-recall-private-report.mjs";
import {
  recordRecallAttempt,
} from "../apps/web/src/features/study/study-recall-planning.mjs";

const subject = "11111111-1111-4111-8111-111111111111";
const q1 = "a2222222-2222-4222-8222-222222222222";
const q2 = "b3333333-3333-4333-8333-333333333333";
const q3 = "c4444444-4444-4444-8444-444444444444";
const history = recordRecallAttempt(
  subject,
  [],
  1,
  [q1, q2, q3],
  { [q1]: "review", [q2]: "understood", [q3]: "review" },
);
const current = {
  pass: 2, total: 2, understood: 1, review: 1, pending: 0,
};
const input = { history, current, minutes: 30 };
assert.equal(RECALL_REPORT_FORMAT, "losapuntes.private-recall-report");
assert.equal(RECALL_REPORT_VERSION, 1);

const before = JSON.stringify(input);
const report = buildPrivateRecallReport(input);
assert.match(report, /Intento 1: 3 preguntas/u);
assert.match(report, /Intento 2: 2 preguntas/u);
assert.match(report, /Preguntas marcadas para repasar: 1/u);
assert.match(report, /Tiempo estimado total: 30 minutos/u);
assert.match(report, /No es una calificación/u);
assert.ok(report.endsWith("\n"));
assert.equal(JSON.stringify(input), before);
for (const forbidden of [subject, q1, q2, q3, "mi respuesta",
  "mail@example.com", "token", "2026-10-19"]) {
  assert.equal(report.includes(forbidden), false);
}
const empty = buildPrivateRecallReport({
  history: [], current: { pass: 1, total: 1, understood: 0, review: 0, pending: 1 },
  minutes: 20,
});
assert.match(empty, /Tiempo estimado total: 0 minutos/u);
assert.doesNotMatch(empty, /Intento 2/u);

const badInputs = [
  null, [], {},
  { ...input, subjectId: subject },
  { ...input, notes: "secret" },
  { ...input, history: null },
  { ...input, minutes: 21 },
  { ...input, minutes: "30" },
  { ...input, current: { ...current, id: q1 } },
  { ...input, current: { ...current, body: "secret" } },
  { ...input, current: { ...current, total: 12 } },
  { ...input, current: { ...current, review: 2 } },
  { ...input, current: { ...current, pass: 1 } },
  { ...input, current: { ...current, total: 3 } },
  { ...input, current: { ...current, pass: -1 } },
  { ...input, history: [{ ...history[0], metadata: "private" }] },
  { ...input, history: [{ ...history[0], pending: 200 }] },
  { ...input, history: [history[0], history[0]] },
  { ...input, history: Array.from({ length: 9 }, () => history[0]) },
  { ...input, history: [{ ...history[0], pass: 2 }] },
];
for (const value of badInputs) {
  assert.throws(() => buildPrivateRecallReport(value), /RECALL_PRIVATE_REPORT_INVALID/u);
}

const page = readFileSync(
  new URL("../apps/web/src/pages/StudyPractice.tsx", import.meta.url),
  "utf8",
);
const types = readFileSync(
  new URL("../apps/web/src/features/study/study-recall-private-report.d.mts", import.meta.url),
  "utf8",
);
assert.match(types, /export declare function buildPrivateRecallReport/u);
assert.match(page, /buildPrivateRecallReport\(\{/u);
assert.match(page, /history: round\.history/u);
assert.match(page, /pass: round\.pass/u);
assert.match(page, /total: summary\.total/u);
assert.match(page, /minutes: review\.minutes/u);
assert.match(page, /downloadPrivateRecallSummary\(report\)/u);
assert.match(page, /anchor\.download = "los-apuntes-mi-resumen-de-practica\.md"/u);
assert.match(page, /onClick=\{downloadPrivateSummary\}/u);
assert.match(page, /URL\.revokeObjectURL/u);
assert.doesNotMatch(page, /localStorage|sessionStorage|IndexedDB/iu);
console.log("B137 strict aggregate-only user-initiated practice report PASS");
