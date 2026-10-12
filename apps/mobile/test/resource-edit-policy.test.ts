import assert from "node:assert/strict";
import test from "node:test";
import type { ResourceView } from "@losapuntes/contracts";

import {
  resourceEditDraft,
  validateResourceEdit,
} from "../src/features/resources/resource-edit-policy";

function resource(overrides: Partial<ResourceView> = {}): ResourceView {
  return {
    id: "resource-a",
    title: "Álgebra",
    description: "Práctica del parcial",
    tags: ["resumen", "parcial"],
    visibility: "private",
    author: null,
    academic: {
      subject: { id: "subject-a", name: "Álgebra I" },
      courseOffering: null,
    },
    file: {
      id: "file-a",
      filename: "parcial.pdf",
      mimeType: "application/pdf",
      byteSize: 1234,
    },
    capabilities: { edit: true, manageShares: true },
    revision: 7,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

test("unchanged form never sends an empty PATCH", () => {
  const original = resource();
  assert.deepEqual(
    validateResourceEdit(original, resourceEditDraft(original)),
    { kind: "unchanged" },
  );
});

test("minimal update uses exact server revision and only changed fields", () => {
  const original = resource();
  const draft = resourceEditDraft(original);
  draft.title = "   Nueva   guía  ";
  draft.visibility = "public";
  assert.deepEqual(validateResourceEdit(original, draft), {
    kind: "valid",
    patch: {
      expectedRevision: 7,
      title: "Nueva guía",
      visibility: "public",
    },
  });
  assert.equal(original.title, "Álgebra");
});

test("clearing description and tags emits explicit null and empty array", () => {
  const original = resource();
  const draft = resourceEditDraft(original);
  draft.description = " ";
  draft.tagsText = "";
  assert.deepEqual(validateResourceEdit(original, draft), {
    kind: "valid",
    patch: { expectedRevision: 7, description: null, tags: [] },
  });
});

test("title length is validated after normalized whitespace", () => {
  const original = resource();
  const draft = resourceEditDraft(original);
  draft.title = " A ";
  assert.equal(validateResourceEdit(original, draft).kind, "invalid");
  draft.title = "x".repeat(161);
  assert.equal(validateResourceEdit(original, draft).kind, "invalid");
  draft.title = "x".repeat(160);
  assert.equal(validateResourceEdit(original, draft).kind, "valid");
});

test("description supports empty text but rejects more than 3000 characters", () => {
  const original = resource();
  const draft = resourceEditDraft(original);
  draft.description = "x".repeat(3001);
  assert.equal(validateResourceEdit(original, draft).kind, "invalid");
  draft.description = "x".repeat(3000);
  assert.equal(validateResourceEdit(original, draft).kind, "valid");
});

test("invalid tags reject duplicates, blanks, excessive count and length", () => {
  const original = resource({ tags: [] });
  const draft = resourceEditDraft(original);
  for (const tagsText of [
    "x, x",
    "x,,y",
    Array.from({ length: 13 }, (_, i) => `tag-${i}`).join(","),
    "x".repeat(41),
    " x, , y ",
  ]) {
    draft.tagsText = tagsText;
    assert.equal(validateResourceEdit(original, draft).kind, "invalid");
  }
  draft.tagsText = "primer parcial, repaso";
  assert.equal(validateResourceEdit(original, draft).kind, "valid");
});

test("visibility permits exactly the three supported server values", () => {
  const original = resource();
  const draft = resourceEditDraft(original);
  for (const visibility of ["private", "shared", "public"] as const) {
    draft.visibility = visibility;
    assert.notEqual(validateResourceEdit(original, draft).kind, "invalid");
  }
  draft.visibility = "unlisted" as "private";
  assert.equal(validateResourceEdit(original, draft).kind, "invalid");
});

test("edit payload cannot change resource ownership, file or subject", () => {
  const original = resource();
  const draft = resourceEditDraft(original);
  draft.title = "Nuevo título";
  const validated = validateResourceEdit(original, draft);
  assert.equal(validated.kind, "valid");
  if (validated.kind === "valid") {
    assert.deepEqual(
      Object.keys(validated.patch).sort(),
      ["expectedRevision", "title"],
    );
  }
});
