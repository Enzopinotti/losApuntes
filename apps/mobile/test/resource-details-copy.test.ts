import assert from "node:assert/strict";
import test from "node:test";

import {
  resourceFileTypeLabel,
  resourceVisibilityLabel,
} from "../src/features/resources/resource-details-copy";

test("resource visibility values have concise Spanish labels", () => {
  assert.equal(resourceVisibilityLabel("private"), "Privado");
  assert.equal(resourceVisibilityLabel("shared"), "Compartido");
  assert.equal(resourceVisibilityLabel("public"), "Público");
});

test("supported file MIME types are shown as familiar formats", () => {
  assert.equal(resourceFileTypeLabel("application/pdf"), "PDF");
  assert.equal(resourceFileTypeLabel("image/jpeg"), "JPEG");
  assert.equal(resourceFileTypeLabel("image/png"), "PNG");
  assert.equal(resourceFileTypeLabel("image/webp"), "WebP");
});

test("file MIME labels normalize case and parameters without guessing", () => {
  assert.equal(resourceFileTypeLabel("Application/PDF; charset=binary"), "PDF");
  assert.equal(
    resourceFileTypeLabel("application/zip"),
    "Formato no identificado",
  );
  assert.equal(resourceFileTypeLabel(""), "Formato no identificado");
});
