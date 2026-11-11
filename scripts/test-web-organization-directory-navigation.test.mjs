import assert from "node:assert/strict";
import test from "node:test";
import {
  DIRECTORY_TYPES,
  organizationDirectoryClearParams,
  organizationDirectoryFiltersFromParams,
  organizationDirectoryInstitutionParams,
  organizationDirectoryListHref,
  organizationDirectorySearchParams,
} from "../apps/web/src/features/organizations/organization-directory-navigation.mjs";

const institution = "123e4567-e89b-42d3-a456-426614174000";
const params = (value) => new URLSearchParams(value);

test("empty directory discovery is explicitly public and unrestricted", () => {
  assert.deepEqual(organizationDirectoryFiltersFromParams(params("")), {
    q: "",
    type: "",
    verificationState: "",
    institutionId: "",
  });
  assert.equal(organizationDirectoryListHref(params("")), "/organizations");
});

test("all nine organization types round trip without an extra request", () => {
  assert.equal(DIRECTORY_TYPES.length, 9);
  for (const type of DIRECTORY_TYPES) {
    assert.equal(organizationDirectoryFiltersFromParams(params("type=" + type)).type, type);
    assert.equal(organizationDirectoryListHref(params("type=" + type)), "/organizations?type=" + type);
  }
});

test("a shared search restores trimmed names, verification and institution", () => {
  const parsed = organizationDirectoryFiltersFromParams(
    params(`q=%20%20Club%20de%20ciencias%20%20&type=club&verificationState=verified&institutionId=${institution}`),
  );
  assert.deepEqual(parsed, {
    q: "Club de ciencias",
    type: "club",
    verificationState: "verified",
    institutionId: institution,
  });
});

test("malformed and duplicate filters fail closed rather than broaden search", () => {
  const bad = [
    "q=", "q=x", "q=%20%20", "q=" + "a".repeat(121),
    "q=club&q=club", "type=", "type=future_type", "type=club&type=club",
    "verificationState=", "verificationState=VERIFIED",
    "verificationState=verified&verificationState=verified",
    "institutionId=", "institutionId=not-uuid",
    `institutionId=${institution}&institutionId=${institution}`,
    "q=club&verificationState=untrusted",
  ];
  for (const raw of bad) {
    assert.equal(organizationDirectoryFiltersFromParams(params(raw)), null, raw);
    assert.equal(organizationDirectoryListHref(params(raw)), null, raw);
  }
  assert.equal(
    organizationDirectoryFiltersFromParams(params("q=" + "z".repeat(120))).q.length,
    120,
  );
  assert.equal(organizationDirectoryListHref(params("q=%20club%20")),
    "/organizations?q=club");
});

test("applying drafts keeps the institution and removes old query keys", () => {
  const original = params(`institutionId=${institution}&q=viejo&type=association&verificationState=verified`);
  const next = organizationDirectorySearchParams(original, "  Taller & Ciencia  ", "club", "unverified");
  assert.equal(
    next.toString(),
    `institutionId=${institution}&q=Taller+%26+Ciencia&type=club&verificationState=unverified`,
  );
  assert.equal(
    organizationDirectorySearchParams(original, "x", "club", ""),
    null,
  );
  assert.equal(organizationDirectorySearchParams(original, "hola", "invalid", ""), null);
  assert.equal(
    organizationDirectorySearchParams(original, "", "", "").toString(),
    `institutionId=${institution}`,
  );
});

test("institution selection and removal preserve search and status", () => {
  const original = params("q=alumni&type=alumni_association&verificationState=verified");
  const selected = organizationDirectoryInstitutionParams(original, institution);
  assert.equal(selected.get("institutionId"), institution);
  assert.equal(selected.get("q"), "alumni");
  assert.equal(selected.get("verificationState"), "verified");
  assert.equal(organizationDirectoryInstitutionParams(original, "bad-id"), null);
  const removed = organizationDirectoryInstitutionParams(selected, null);
  assert.equal(removed.has("institutionId"), false);
  assert.equal(removed.get("q"), "alumni");
});

test("clear filters preserves unrelated router keys but shares only public keys", () => {
  const original = params(
    `cursor=private&token=secret&id=detail&q=matrices&type=lab&verificationState=verified&institutionId=${institution}`,
  );
  const shared = organizationDirectoryListHref(original);
  assert.equal(
    shared,
    `/organizations?q=matrices&type=lab&verificationState=verified&institutionId=${institution}`,
  );
  assert.equal(shared.includes("cursor"), false);
  assert.equal(shared.includes("secret"), false);
  assert.equal(shared.includes("detail"), false);
  const cleared = organizationDirectoryClearParams(original);
  assert.equal(cleared.get("cursor"), "private");
  assert.equal(cleared.get("token"), "secret");
  assert.equal(cleared.has("q"), false);
  assert.equal(cleared.has("institutionId"), false);
  assert.equal(organizationDirectoryListHref(cleared), "/organizations");
});
