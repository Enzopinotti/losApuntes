import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("global and contextual search both use the same resource quick-save control", () => {
  const screen = file("../src/features/search/search-screen.tsx");
  assert.match(screen, /function ResourceGroup\(/u);
  assert.match(screen, /function ContextualDiscovery\(/u);
  assert.match(screen, /function ResourceResult\(/u);
  const repeated =
    screen.match(/quickSaveEntry=\{quickSave\.items\[resource\.id\]\}/gu) ?? [];
  assert.equal(repeated.length, 2);
  assert.match(screen, /Guardar \$\{resource\.title\} desde Buscar/u);
  assert.match(screen, /No pudimos confirmar el guardado/u);
  assert.match(screen, /Revisar Guardados/u);
});

test("saving uses existing session-authorized API and does not duplicate backend policy", () => {
  const screen = file("../src/features/search/search-screen.tsx");
  const consumption = file(
    "../src/features/resources/resource-consumption-api.ts",
  );
  const controller = file(
    "../src/features/search/search-quick-save-controller.ts",
  );
  assert.match(screen, /mobileResourceConsumptionApi/u);
  assert.match(
    screen,
    /quickSaveController\.save\(authorityKey, resourceId\)/u,
  );
  assert.match(consumption, /save\(resourceId: string/u);
  assert.match(controller, /response\.saved !== true/u);
  assert.match(controller, /existing\?\.state === "uncertain"/u);
});

test("Search focus and account scope cancel late save completions", () => {
  const screen = file("../src/features/search/search-screen.tsx");
  const controller = file(
    "../src/features/search/search-quick-save-controller.ts",
  );
  assert.match(screen, /quickSaveController\.setAuthority\(authorityKey\)/u);
  assert.match(screen, /quickSaveController\.invalidate\(\)/u);
  assert.match(
    controller,
    /this\.operations\.get\(operation\.resourceId\) === operation/u,
  );
  assert.match(controller, /operation\.controller\.abort\(\)/u);
});

test("save action remains separate from opening the resource detail", () => {
  const screen = file("../src/features/search/search-screen.tsx");
  assert.match(screen, /onPress=\{onPress\}/u);
  assert.match(screen, /onPress=\{onQuickSave\}/u);
  assert.match(screen, /pathname: "\/resources\/\[id\]"/u);
});
