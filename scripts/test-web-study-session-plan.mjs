import assert from "node:assert/strict";
import {
  STUDY_SESSION_MAX_TASKS,
  emptyStudySession,
  normalizeStudySession,
  readStudySession,
  serializeStudySession,
  studySessionStats,
  buildStudySessionCalendar,
  buildStudySessionMarkdown,
} from "../apps/web/src/features/study/study-session-plan.mjs";
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const c = "33333333-3333-4333-8333-333333333333";
const plan = {
  ...emptyStudySession(a),
  title: "Final de Algoritmos",
  notes: "Revisar los ejercicios",
  startsAt: "2026-10-20T15:00",
  tasks: [
    { kind: "resource", id: b, minutes: 45, done: true },
    { kind: "question", id: c, minutes: 25, done: false },
  ],
};
assert.deepEqual(readStudySession(serializeStudySession(plan)), plan);
assert.deepEqual(studySessionStats(plan), {
  totalTasks: 2, doneTasks: 1, totalMinutes: 70,
  doneMinutes: 45, remainingMinutes: 25,
});
const md = buildStudySessionMarkdown(plan, ["Apunte", "Duda"]);
assert.ok(md.includes("- [x] 1. Apunte — 45 min"));
assert.ok(md.includes("- [ ] 2. Duda — 25 min"));
const ics = buildStudySessionCalendar(
  plan,
  ["Apunte", "Duda"],
  "44444444-4444-4444-8444-444444444444",
  new Date("2026-10-14T12:00:00.000Z"),
);
assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
assert.ok(ics.includes("BEGIN:VEVENT\r\n"));
assert.ok(ics.includes("END:VCALENDAR\r\n"));
assert.ok(ics.includes("UID:44444444-4444-4444-8444-444444444444@losapuntes.app"));
assert.ok(ics.split("\\r\\n").every((line) => new TextEncoder().encode(line).length <= 75));
const rejects = (input) => assert.throws(() => normalizeStudySession(input));
rejects({ ...plan, subjectId: "wrong" });
rejects({ ...plan, version: 2 });
rejects({ ...plan, startsAt: "2026-02-30T18:00" });
rejects({ ...plan, unknownField: true });
rejects({ ...plan, title: " " });
rejects({ ...plan, tasks: [...plan.tasks, plan.tasks[0]] });
rejects({ ...plan, tasks: [...plan.tasks, { ...plan.tasks[0], id: b.toUpperCase() }] });
rejects({ ...plan, tasks: plan.tasks.map((t) => ({...t, minutes: 3})) });
rejects({ ...plan, tasks: Array.from({length: STUDY_SESSION_MAX_TASKS + 1}, (_, i) => ({
  kind: "resource", id: b, minutes: 10, done: false,
})) });
assert.throws(() => readStudySession("not json"));
assert.throws(() => readStudySession(" ".repeat(64001)));
assert.throws(() => buildStudySessionCalendar(plan, [], c, new Date()));
assert.throws(() => buildStudySessionCalendar({...plan, startsAt:null}, ["A","B"], c, new Date()));
assert.throws(() => buildStudySessionMarkdown(plan, ["A"]));
const privateFile = serializeStudySession(plan);
assert.ok(!privateFile.includes("Apunte"));
assert.ok(!privateFile.includes("Duda"));
assert.ok(!privateFile.includes("signedUrl"));
console.log("Study session portable contract PASS");
