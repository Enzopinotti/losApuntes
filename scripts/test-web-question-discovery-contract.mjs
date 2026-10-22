import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  EMPTY_QUESTION_DISCOVERY,
  questionDiscoveryHref,
  questionDiscoverySelectionFromParams,
  questionDiscoverySelectionKey,
} from "../apps/web/src/features/community/question-discovery-navigation.mjs";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const subject = "b2d9085e-4fa2-4f12-8b31-2acf4219d876";
const question = "ad182ec1-8f27-4aaa-92c0-3ec889776a28";
const selection = {
  q: "Análisis & prácticas + SQL",
  status: "open",
  subjectId: subject,
};

const href = questionDiscoveryHref(selection);
assert.equal(
  href,
  "/questions?q=An%C3%A1lisis+%26+pr%C3%A1cticas+%2B+SQL&status=open&subjectId=" +
    subject,
);
assert.deepEqual(
  questionDiscoverySelectionFromParams(
    new URLSearchParams(href.split("?")[1]),
  ),
  selection,
);
assert.equal(questionDiscoveryHref(EMPTY_QUESTION_DISCOVERY), "/questions");
assert.deepEqual(
  questionDiscoverySelectionFromParams(new URLSearchParams()),
  EMPTY_QUESTION_DISCOVERY,
);
assert.equal(
  questionDiscoveryHref({ q: "  parcial  ", status: "", subjectId: "" }),
  "/questions?q=parcial",
);
assert.deepEqual(
  questionDiscoverySelectionFromParams(
    new URLSearchParams("status=closed&subjectId=" + subject.toUpperCase()),
  ),
  { q: "", status: "closed", subjectId: subject },
);
assert.notEqual(
  questionDiscoverySelectionKey(selection),
  questionDiscoverySelectionKey({ ...selection, subjectId: "" }),
  "Changing subject invalidates the prior page identity",
);
assert.notEqual(
  questionDiscoverySelectionKey(selection),
  questionDiscoverySelectionKey({ ...selection, status: "closed" }),
);
assert.equal(questionDiscoverySelectionKey(null), null);

const detailHref = questionDiscoveryHref(selection, question);
assert.ok(detailHref?.endsWith("&id=" + question));
const detailParams = new URLSearchParams(detailHref?.split("?")[1]);
assert.deepEqual(questionDiscoverySelectionFromParams(detailParams), selection);
detailParams.delete("id");
assert.equal(
  questionDiscoveryHref(questionDiscoverySelectionFromParams(detailParams)),
  href,
  "Returning to the list must retain all discovery filters",
);
assert.equal(questionDiscoveryHref(selection, "https://evil.example"), null);
assert.equal(questionDiscoveryHref(selection, "not-a-uuid"), null);

for (const query of [
  "q=x",
  "q=",
  "q=+",
  "q=" + "x".repeat(121),
  "q=ok%0Aprivate",
  "q=parcial&q=secret",
  "status=",
  "status=pending",
  "status=open&status=closed",
  "subjectId=",
  "subjectId=not-an-id",
  "subjectId=" + subject + "&subjectId=" + subject,
]) {
  assert.equal(
    questionDiscoverySelectionFromParams(new URLSearchParams(query)),
    null,
    "Malformed URL must be rejected rather than broaden the query: " + query,
  );
}
for (const input of [
  { q: "x", status: "", subjectId: "" },
  { q: "", status: "private", subjectId: "" },
  { q: "", status: "", subjectId: "bad" },
  { q: "a" + String.fromCharCode(10) + "b", status: "", subjectId: "" },
]) {
  assert.equal(questionDiscoveryHref(input), null);
}
assert.equal(
  questionDiscoverySelectionFromParams(
    new URLSearchParams("id=" + question),
  )?.q,
  "",
  "Existing notification/feed deep links continue to load a question",
);

const page = await read("apps/web/src/pages/Questions.tsx");
assert.match(page, /questionDiscoverySelectionFromParams\(searchParams\)/u);
assert.match(page, /const invalidFilters = selection === null/u);
assert.match(page, /if \(invalidFilters\) return/u);
assert.match(page, /subjectId: committedSubjectId \|\| undefined/u);
assert.match(page, /committedQuery \|\| undefined/u);
assert.match(page, /committedStatus \|\| undefined/u);
assert.match(page, /questions-list:\$\{listScopeKey\}/u);
assert.match(page, /const \[query, setQuery\] = useState\(committedQuery\)/u);
assert.match(page, /const submitDiscovery = /u);
assert.match(page, /setSearchParams\(next\)/u);
assert.match(page, /next\.set\("id", id\)/u);
assert.match(page, /next\.delete\("id"\)/u);
assert.match(page, /<QuestionDiscoverySubjectPicker/u);
assert.match(page, /Copiar enlace de búsqueda/u);
assert.match(page, /Copiar enlace a esta pregunta/u);
assert.match(page, /navigator\.clipboard\.writeText/u);
assert.match(page, /const \[filterError, setFilterError\]/u);
assert.match(page, /role="alert"/u);
assert.doesNotMatch(page, /localStorage|sessionStorage/u);

const picker = await read(
  "apps/web/src/features/community/QuestionDiscoverySubjectPicker.tsx",
);
assert.match(picker, /resourcesApi\.searchSubjects\(q, ticket\.signal\)/u);
assert.match(picker, /useAsyncAuthorityFence\(key\)/u);
assert.match(picker, /state = searchState\?\.key === key/u);
assert.match(picker, /setQuery\(""\)/u);
assert.match(picker, /onSelect\(option\)/u);
assert.match(picker, /Quitar filtro de materia/u);

const api = await read(
  "apps/web/src/features/community/services/communityService.ts",
);
assert.match(api, /if \(input\.subjectId\) query\.set\("subjectId", input\.subjectId\)/u);
assert.match(api, /credentials: "include"/u);
assert.match(api, /cache: "no-store"/u);

console.log("PASS shareable Q&A discovery by academic subject, state and text");
