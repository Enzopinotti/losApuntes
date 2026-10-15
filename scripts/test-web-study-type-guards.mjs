import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

const kits = await read("apps/web/src/pages/StudyKits.tsx");
assert.doesNotMatch(
  kits,
  /\bnormalizeStudyKitArchive\b/u,
  "Portable kit normalization is performed in the archive module, not by an unused screen import",
);

const session = await read("apps/web/src/pages/StudySession.tsx");
const clearDraft = session.slice(
  session.indexOf('¿Vaciar el borrador temporal?') - 280,
  session.indexOf('¿Vaciar el borrador temporal?') + 350,
);
assert.ok(
  clearDraft.includes("if (!subjectId) return;"),
  "Clearing a study draft must require an authoritative academic subject",
);
assert.ok(
  clearDraft.indexOf("if (!subjectId) return;") <
    clearDraft.indexOf("window.confirm("),
  "The missing-subject guard must run before the destructive confirmation",
);
assert.match(
  clearDraft,
  /emptyStudySession\(subjectId\)/u,
  "A fresh session still uses the selected subject after explicit confirmation",
);
assert.match(
  session,
  /const subjectId = subject\?\.id \?\? null;/u,
  "The subject remains derived from the scoped academic context",
);

console.log("PASS Study session subject authority and portable-kit import contract");
