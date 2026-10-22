import assert from "node:assert/strict";
import test from "node:test";

import { cameraAssetResourceFile } from "../src/features/resources/resource-camera-selection";

const asset = (overrides = {}) => ({
  uri: "file:///cache/capture.jpg",
  fileName: "capture.jpg",
  fileSize: 4096,
  mimeType: "image/jpeg",
  ...overrides,
});

test("camera image metadata flows into the existing private upload selection", () => {
  assert.deepEqual(cameraAssetResourceFile(asset(), 5000), {
    uri: "file:///cache/capture.jpg",
    name: "capture.jpg",
    size: 4096,
    mimeType: "image/jpeg",
  });
});

test("camera image uses the local file size when picker metadata is absent", () => {
  assert.deepEqual(
    cameraAssetResourceFile(asset({ fileSize: null, mimeType: null }), 5000),
    {
      uri: "file:///cache/capture.jpg",
      name: "capture.jpg",
      size: 5000,
      mimeType: "image/jpeg",
    },
  );
});

test("invalid camera file-size metadata falls back to the local file", () => {
  assert.deepEqual(
    cameraAssetResourceFile(
      asset({ fileSize: Number.POSITIVE_INFINITY }),
      5000,
    ),
    {
      uri: "file:///cache/capture.jpg",
      name: "capture.jpg",
      size: 5000,
      mimeType: "image/jpeg",
    },
  );
});

test("camera file names cannot escape the local upload name or contain controls", () => {
  assert.equal(
    cameraAssetResourceFile(
      asset({ fileName: "..\\..\\captura\u202e.jpg" }),
      10,
    )?.name,
    "captura.jpg",
  );
  assert.equal(
    cameraAssetResourceFile(asset({ fileName: "x".repeat(181) }), 10)?.name,
    "captura.jpg",
  );
});

test("invalid camera URIs or file sizes fail closed", () => {
  assert.equal(cameraAssetResourceFile(asset({ uri: " " }), 10), null);
  assert.equal(cameraAssetResourceFile(asset({ uri: "" }), 10), null);
  const noPickerSize = asset({ fileSize: null });
  assert.equal(cameraAssetResourceFile(noPickerSize, -1), null);
  assert.equal(cameraAssetResourceFile(noPickerSize, Number.NaN), null);
  assert.equal(
    cameraAssetResourceFile(noPickerSize, Number.MAX_SAFE_INTEGER + 1),
    null,
  );
});
