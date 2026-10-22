import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("camera capture asks permission only after an explicit native action", () => {
  const screen = file("../src/app/(tabs)/create.tsx");
  const takePhotoStart = screen.indexOf("const takePhoto = async () => {");
  const takePhotoEnd = screen.indexOf("const clearPickedFile = () => {");
  assert.ok(takePhotoStart >= 0 && takePhotoEnd > takePhotoStart);

  const takePhoto = screen.slice(takePhotoStart, takePhotoEnd);
  assert.match(takePhoto, /requestCameraPermissionsAsync\(\)/u);
  assert.match(takePhoto, /launchCameraAsync\(/u);
  assert.match(takePhoto, /exif: false/u);
  assert.match(
    takePhoto,
    /mimeType: mimeFromSelection\(photo\.mimeType, photo\.name\)/u,
  );
  assert.match(
    takePhoto,
    /acceptPickedFile\([\s\S]*\},\s*true,\s*generation,\s*\)/u,
  );
  assert.match(screen, /accessibilityLabel="Tomar foto de un apunte"/u);
  assert.match(screen, /Platform\.OS !== "web"/u);
  assert.equal(screen.match(/requestCameraPermissionsAsync\(\)/gu)?.length, 1);
  assert.doesNotMatch(screen, /launchImageLibraryAsync|base64/u);
});

test("camera plugin disables unused photo-library and microphone permissions", () => {
  const config = JSON.parse(file("../app.json")) as {
    expo: {
      plugins: readonly (string | readonly [string, Record<string, unknown>])[];
    };
  };
  const imagePicker = config.expo.plugins.find(
    (entry): entry is readonly [string, Record<string, unknown>] =>
      Array.isArray(entry) && entry[0] === "expo-image-picker",
  );

  assert.ok(imagePicker);
  assert.equal(imagePicker[1].photosPermission, false);
  assert.equal(imagePicker[1].microphonePermission, false);
  assert.match(String(imagePicker[1].cameraPermission), /cámara/u);
});
