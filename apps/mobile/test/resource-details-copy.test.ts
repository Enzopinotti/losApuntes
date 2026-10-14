import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resourceAuthorAction,
  resourceFileSizeLabel,
  resourceFileTypeLabel,
  resourceRowAccessibilityLabel,
  resourceVisibilityLabel,
} from "../src/features/resources/resource-details-copy";

test("resource details open the server-projected author profile accessibly", () => {
  const action = resourceAuthorAction({
    profileId: "profile-1",
    displayName: "Ana Pérez",
    avatarUrl: null,
  });
  assert.deepEqual(action, {
    profileId: "profile-1",
    accessibilityLabel: "Ver perfil de Ana Pérez",
    accessibilityHint:
      "Abre el perfil público y vuelve a comprobar los permisos actuales.",
  });
  assert.equal(resourceAuthorAction(null), null);
  assert.equal(
    resourceAuthorAction({
      profileId: "  ",
      displayName: "Cuenta",
      avatarUrl: null,
    }),
    null,
  );

  const screen = readFileSync(
    new URL(
      "../src/features/resources/resource-details-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(screen, /accessibilityLabel=\{action\.accessibilityLabel\}/u);
  assert.match(screen, /pathname:\s*"\/profiles\/\[profileId\]"/u);
  assert.match(screen, /onPress=\{\(\) => void toggleSaved\(\)\}/u);
  assert.match(screen, /onPress=\{\(\) => void openFile\(\)\}/u);
});

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

test("resource row labels expose the visible subject, author, type, and size", () => {
  assert.equal(
    resourceRowAccessibilityLabel(
      {
        title: "Base de datos I",
        subjectName: "Sistemas de Información",
        authorName: "Ana Pérez",
        mimeType: "application/pdf",
        byteSize: 1572864,
      },
      "Abrir recurso",
    ),
    "Abrir recurso: Base de datos I. Materia: Sistemas de Información. Autor: Ana Pérez. Formato: PDF. Tamaño: 1,5 MB.",
  );
});

test("resource row labels keep neutral copy for missing authors and unknown MIME", () => {
  assert.equal(
    resourceRowAccessibilityLabel(
      {
        title: "Apunte sin autor",
        subjectName: "Historia",
        authorName: null,
        mimeType: "application/zip",
        byteSize: 1024,
      },
      "Abrir recurso guardado",
    ),
    "Abrir recurso guardado: Apunte sin autor. Materia: Historia. Autor: no disponible. Formato: Formato no identificado. Tamaño: 1 KB.",
  );
});
