import assert from "node:assert/strict";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";
import {
  resourceMetadataDraft,
  resourceMetadataMatches,
  validateResourceMetadata,
  RESOURCE_DESCRIPTION_MAX_LENGTH,
  RESOURCE_TAG_MAX_COUNT,
  RESOURCE_TAG_MAX_LENGTH,
  RESOURCE_TITLE_MAX_LENGTH,
} from "../src/features/resources/resource-metadata-policy";

function resource(overrides: Partial<ResourceView> = {}): ResourceView {
  return {
    id: "r-1",
    title: "Álgebra inicial",
    description: "Un resumen",
    tags: ["parcial", "apuntes"],
    revision: 4,
    capabilities: { edit: true, manageShares: true },
    visibility: "private",
    author: null,
    academic: {
      subject: { id: "subject-1", name: "Álgebra" },
      courseOffering: null,
    },
    file: {
      id: "file-1",
      filename: "resumen.pdf",
      mimeType: "application/pdf",
      byteSize: 100,
    },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

test("editing starts with the authenticated resource metadata", () => {
  assert.deepEqual(resourceMetadataDraft(resource()), {
    title: "Álgebra inicial",
    description: "Un resumen",
    tagsText: "parcial, apuntes",
  });
  const validation = validateResourceMetadata(
    resource(),
    resourceMetadataDraft(resource()),
  );
  assert.equal(validation.kind, "unchanged");
});

test("a title-only patch includes expected revision and no unrelated data", () => {
  const current = resource();
  const validated = validateResourceMetadata(current, {
    ...resourceMetadataDraft(current),
    title: "  Álgebra II  ",
  });
  assert.deepEqual(validated, {
    kind: "valid",
    input: { expectedRevision: 4, title: "Álgebra II" },
  });
});

test("empty description clears the field and empty tags remove all labels", () => {
  const current = resource();
  const validated = validateResourceMetadata(current, {
    title: current.title,
    description: "   ",
    tagsText: " ",
  });
  assert.deepEqual(validated, {
    kind: "valid",
    input: { expectedRevision: 4, description: null, tags: [] },
  });
});

test("normalizes comma-separated tags without mutating resource", () => {
  const current = resource();
  const validated = validateResourceMetadata(current, {
    ...resourceMetadataDraft(current),
    tagsText: "  Parcial 1  ,  Física aplicada ",
  });
  assert.deepEqual(validated, {
    kind: "valid",
    input: {
      expectedRevision: 4,
      tags: ["Parcial 1", "Física aplicada"],
    },
  });
  assert.deepEqual(current.tags, ["parcial", "apuntes"]);
});

test("invalid permissions, title length and revision are rejected", () => {
  assert.equal(
    validateResourceMetadata(
      resource({ capabilities: { edit: false, manageShares: false } }),
      { title: "Correcto", description: "", tagsText: "" },
    ).kind,
    "invalid",
  );
  assert.equal(
    validateResourceMetadata(resource({ revision: 0 }), {
      title: "Correcto",
      description: "",
      tagsText: "",
    }).kind,
    "invalid",
  );
  for (const title of [" ", "a", "x".repeat(161)]) {
    assert.equal(
      validateResourceMetadata(resource(), {
        title,
        description: "",
        tagsText: "",
      }).kind,
      "invalid",
    );
  }
  assert.equal(RESOURCE_TITLE_MAX_LENGTH, 160);
});

test("enforces backend description and tag count/length limits", () => {
  const current = resource();
  for (const draft of [
    { title: current.title, description: "x".repeat(3001), tagsText: "" },
    { title: current.title, description: "", tagsText: "x".repeat(41) },
    {
      title: current.title,
      description: "",
      tagsText: Array.from({ length: 13 }, (_, i) => `tag-${i}`).join(","),
    },
    { title: current.title, description: "", tagsText: "Nota, nota" },
  ]) {
    assert.equal(validateResourceMetadata(current, draft).kind, "invalid");
  }
  assert.equal(RESOURCE_DESCRIPTION_MAX_LENGTH, 3000);
  assert.equal(RESOURCE_TAG_MAX_COUNT, 12);
  assert.equal(RESOURCE_TAG_MAX_LENGTH, 40);
});

test("server response must contain expected edits with increased revision", () => {
  const original = resource();
  const input = {
    expectedRevision: 4,
    title: "Nuevo título",
    tags: ["guia"],
    description: null,
  };
  const updated = resource({
    revision: 5,
    title: "Nuevo título",
    tags: ["guia"],
    description: null,
  });
  assert.equal(resourceMetadataMatches(updated, original, input), true);
  assert.equal(
    resourceMetadataMatches({ ...updated, revision: 4 }, original, input),
    false,
  );
  assert.equal(
    resourceMetadataMatches({ ...updated, title: "Otro" }, original, input),
    false,
  );
  assert.equal(
    resourceMetadataMatches({ ...updated, id: "different" }, original, input),
    false,
  );
});

test("description cleanup and Unicode tag dedupe follow server rules", () => {
  const original = resource();
  const validation = validateResourceMetadata(original, {
    ...resourceMetadataDraft(original),
    description: " Líneas\n con   espacios ",
  });
  assert.deepEqual(validation, {
    kind: "valid",
    input: {
      expectedRevision: 4,
      description: "Líneas con espacios",
    },
  });

  assert.equal(
    validateResourceMetadata(original, {
      ...resourceMetadataDraft(original),
      tagsText: "ＡＢＣ, ABC",
    }).kind,
    "invalid",
  );
});
