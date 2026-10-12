import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("resource sharing is shown only for owners with manageShares capability", () => {
  const detail = source(
    "../src/features/resources/resource-details-screen.tsx",
  );
  const panel = source(
    "../src/features/resources/resource-direct-sharing-panel.tsx",
  );
  const controller = source(
    "../src/features/resources/resource-direct-sharing-controller.ts",
  );

  assert.match(detail, /resource\.capabilities\.manageShares \?/u);
  assert.match(
    panel,
    /if \(!resource\.capabilities\.manageShares\) return null/u,
  );
  assert.match(controller, /!current\.canManageShares/u);
  assert.match(
    detail,
    /sharingController\.setScope\(scopeKey, readyResource\)/u,
  );
});

test("sharing UI exposes real people-search results and confirms revocation", () => {
  const detail = source(
    "../src/features/resources/resource-details-screen.tsx",
  );
  const panel = source(
    "../src/features/resources/resource-direct-sharing-panel.tsx",
  );
  assert.match(panel, /Compartir con personas/u);
  assert.match(
    panel,
    /controller\.search\(authorityKey, resource\.id, query\)/u,
  );
  assert.match(panel, /current\.people\.map/u);
  assert.match(panel, /accessibilityRole="radiogroup"/u);
  assert.match(panel, /accessibilityRole="radio"/u);
  assert.match(panel, /accessibilityRole="checkbox"/u);
  assert.match(panel, /confirmRevoke/u);
  assert.match(panel, /Conceder acceso/u);
  assert.match(panel, /Revocar acceso/u);
  assert.match(panel, /No pudimos confirmar/u);
  assert.match(panel, /onRefresh/u);
  assert.match(panel, /Actualizar apunte/u);
  assert.match(detail, /onRefresh=\{retry\}/u);
});

test("sharing API uses authenticated profile routes without a fake grants list", () => {
  const api = source(
    "../src/features/resources/resource-direct-sharing-api.ts",
  );
  const runtime = source("../src/features/resources/resource-runtime.ts");

  assert.match(api, /scope: "people"/u);
  assert.match(api, /method: "PUT"/u);
  assert.match(api, /method: "DELETE"/u);
  assert.match(api, /encodeURIComponent\(profileId\)/u);
  assert.match(api, /isCredentialAuthoritative/u);
  assert.match(runtime, /mobileResourceDirectSharingApi/u);
  assert.doesNotMatch(api, /GET.*shares.*list/u);
});

test("sharing refuses changing permissions of non-shared or stale revisions", () => {
  const controller = source(
    "../src/features/resources/resource-direct-sharing-controller.ts",
  );
  assert.match(controller, /resource\.visibility !== "shared"/u);
  assert.match(controller, /resource\.revision !== current\.revision/u);
  assert.match(controller, /resource\.capabilities\.manageShares/u);
  assert.match(controller, /this\.api\.resource\(/u);
  assert.match(controller, /this\.api\.grant\(/u);
  assert.match(controller, /this\.api\.revoke\(/u);
  assert.match(controller, /this\.abortAll\(\)/u);
});
