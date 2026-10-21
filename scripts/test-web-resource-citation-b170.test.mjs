import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildResourceCitation } from "../apps/web/src/features/resources/resource-citation.mjs";

const id = "4fc90c37-710f-4c9a-9681-ed0476409b4d";
const base = {
  id,
  title: "Álgebra lineal: resumen",
  visibility: "public",
  author: { displayName: "Belén Suárez" },
  academic: { subject: { name: "Álgebra I" } },
};
const origin = "https://losapuntes.example";

test("B170 emits grounded simple attribution, no invented upload/publication date", () => {
  const result = buildResourceCitation(base, origin);
  assert.equal(result.text,
    "Belén Suárez. (s. f.). Álgebra lineal: resumen [Apunte de Álgebra I]. Los Apuntes.\n" +
    "Disponible en: https://losapuntes.example/resources/" + id);
  assert.equal(result.publicLinkIncluded, true);
  assert.equal(result.visibility, "public");
  assert.equal(result.attributionVerified, false);
  assert.equal(result.grantsResourceAccess, false);
});

test("B170 omits deep links completely for owner-private resources", () => {
  const result = buildResourceCitation({ ...base, visibility: "private" }, origin);
  assert.equal(result.publicLinkIncluded, false);
  assert.doesNotMatch(result.text, /https?:|\/resources\/|example/u);
  assert.match(result.text, /Álgebra lineal/u);
});

test("B170 omits links for explicitly shared/granted resources", () => {
  const result = buildResourceCitation({ ...base, visibility: "shared" }, origin);
  assert.equal(result.publicLinkIncluded, false);
  assert.equal(result.grantsResourceAccess, false);
  assert.doesNotMatch(result.text, /https?:|\/resources\//u);
});

test("B170 missing author is never attributed to uploader or institution", () => {
  const missingAuthor = buildResourceCitation({ ...base, author: null }, origin);
  assert.match(missingAuthor.text, /^Autoría no indicada\. \(s\. f\.\)/u);
  assert.ok(!missingAuthor.text.includes("Belén"));
  const missingName = buildResourceCitation({ ...base, author: {} }, origin);
  assert.equal(missingName.text, missingAuthor.text);
});

test("B170 whitespace, newlines and bidirectional control characters do not change structure", () => {
  const value = buildResourceCitation({
    ...base,
    title: "  Apunte\n\u202e peligro \u2066 control ",
    author: { displayName: " \n Belén\t  Suárez  " },
    academic: { subject: { name: "Álgebra\r I" } },
  }, origin);
  assert.equal(value.text,
    "Belén Suárez. (s. f.). Apunte peligro control [Apunte de Álgebra I]. Los Apuntes.\n" +
    "Disponible en: https://losapuntes.example/resources/" + id);
  assert.doesNotMatch(value.text, /\u202e|\u2066/u);
});

test("B170 no fake publication dates or unsafe user-supplied origin", () => {
  for (const host of [
    "javascript:alert(1)",
    "https://other.example/admin",
    "https://user:pass@losapuntes.example",
    "https://losapuntes.example?token=secret",
    "https://losapuntes.example#frag",
    "https://losapuntes.example/",
    "ftp://losapuntes.example",
  ]) {
    assert.throws(() => buildResourceCitation(base, host), undefined, host);
  }
});

test("B170 rejects malicious or malformed resource IDs before building links", () => {
  for (const invalid of [
    "", "resource", "../settings", "x?token=private", "a".repeat(256),
    "4fc90c37-710f-3c9a-9681-ed0476409b4d",
    undefined, null,
  ]) {
    assert.throws(() => buildResourceCitation({ ...base, id: invalid }, origin));
  }
});

test("B170 fails closed for unsupported access levels and missing academic subject", () => {
  for (const visibility of ["unlisted", "", "private,public", null]) {
    assert.throws(() => buildResourceCitation({ ...base, visibility }, origin));
  }
  assert.throws(() => buildResourceCitation({ ...base, academic: null }, origin));
  assert.throws(() => buildResourceCitation({ ...base, title: "" }, origin));
  assert.throws(() => buildResourceCitation({ ...base, title: "a".repeat(260) }, origin));
  assert.throws(() => buildResourceCitation(null, origin));
});

test("B170 does not copy or share by itself, requires explicit user button", async () => {
  const jsx = await readFile("apps/web/src/pages/ResourceCitation.tsx", "utf8");
  const resourcePage = await readFile("apps/web/src/pages/Resources.tsx", "utf8");
  assert.match(jsx, /navigator\.clipboard\.writeText/u);
  assert.match(jsx, /onClick=\{\(\) => void copy\(\)\}/u);
  assert.match(jsx, /readOnly/u);
  assert.match(jsx, /aria-expanded=\{expanded\}/u);
  assert.match(jsx, /aria-label="Referencia académica de este apunte"/u);
  assert.match(resourcePage, /<ResourceCitation/u);
  assert.match(resourcePage, /authScopeKey/u);
  assert.doesNotMatch(jsx, /fetch\(|axios|localStorage|sessionStorage|sendBeacon|dangerouslySetInnerHTML|window\.open/u);
});

test("B170 previews include explicit consent, visibility and access disclaimers", async () => {
  const jsx = await readFile("apps/web/src/pages/ResourceCitation.tsx", "utf8");
  assert.match(jsx, /cita APA/u);
  assert.match(jsx, /at...(?:.*)/u);
  assert.match(jsx, /El apunte no es público/u);
  assert.match(jsx, /no\s+.*permiso para accederlo/u);
});
