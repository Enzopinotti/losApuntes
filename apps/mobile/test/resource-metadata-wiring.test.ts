import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("resource detail presents metadata editing only for server-authorized owners", () => {
  const detail = source("../src/features/resources/resource-details-screen.tsx");
  const editor = source("../src/features/resources/resource-metadata-editor.tsx");

  assert.match(detail, /resource\.capabilities\.edit \?/u);
  assert.match(detail, /metadataController\.setScope\(scopeKey, snapshot\.data\.resource\)/u);
  assert.match(editor, /if \(!visible\.capabilities\.edit\) return null/u);
  assert.match(editor, /Guardar cambios/u);
  assert.match(editor, /Cancelar/u);
  assert.match(editor, /controller\.refresh\(authorityKey, resource\.id\)/u);
});

test("resource metadata update uses existing authorized and revisioned PATCH", () => {
  const transport = source("../src/features/resources/resource-consumption-api.ts");
  const policy = source("../src/features/resources/resource-metadata-policy.ts");
  const controller = source("../src/features/resources/resource-metadata-controller.ts");

  assert.match(transport, /method: "PATCH"/u);
  assert.match(
    transport,
    /this\.transport\.update\(credential, resourceId, input, signal\)/u,
  );
  assert.match(transport, /encodeURIComponent\(resourceId\)/u);
  assert.match(policy, /expectedRevision: resource\.revision/u);
  assert.match(controller, /resourceMetadataMatches\(/u);
  assert.match(controller, /this\.api\.resource\(/u);
});

test("metadata editor does not replace file, identity or academic context", () => {
  const policy = source("../src/features/resources/resource-metadata-policy.ts");
  assert.doesNotMatch(policy, /input\.(?:assetId|authorUserId|subjectId|courseOfferingId|visibility)\s*=/u);
  assert.match(policy, /input\.title\s*=/u);
  assert.match(policy, /input\.description\s*=/u);
  assert.match(policy, /input\.tags\s*=/u);
});
