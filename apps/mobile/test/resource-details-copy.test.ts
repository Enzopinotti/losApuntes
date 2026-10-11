import assert from "node:assert/strict";
import test from "node:test";

import {
  resourceFileSizeLabel,
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

test("file sizes share readable byte, KB, and localized MB labels", () => {
  assert.equal(resourceFileSizeLabel(0), "0 bytes");
  assert.equal(resourceFileSizeLabel(1), "1 byte");
  assert.equal(resourceFileSizeLabel(1023), "1023 bytes");
  assert.equal(resourceFileSizeLabel(1024), "1 KB");
  assert.equal(resourceFileSizeLabel(1536), "2 KB");
  assert.equal(resourceFileSizeLabel(1024 * 1024), "1,0 MB");
  assert.equal(resourceFileSizeLabel(1572864), "1,5 MB");
});
