import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("statistics are reachable only through Mis apuntes, not saved resources", () => {
  const owned = file("../src/features/resources/owned-resources-screen.tsx");
  const route = file("../src/app/my-resource-statistics.tsx");
  const screen = file("../src/features/resources/resource-owner-stats-screen.tsx");
  assert.match(owned, /router\.push\("\/my-resource-statistics"\)/u);
  assert.match(route, /OwnerResourceStatisticsScreen/u);
  assert.match(screen, /title="Estadísticas de mis apuntes"/u);
  assert.match(screen, /pathname: "\/resources\/\[id\]"/u);
});

test("stats UI labels exactly what is counted, not imagined downloads", () => {
  const screen = file("../src/features/resources/resource-owner-stats-screen.tsx");
  assert.match(screen, /Guardados vigentes/u);
  assert.match(screen, /Permisos individuales activos/u);
  assert.match(screen, /No representa/u);
  assert.match(screen, /visualizaciones/u);
  assert.match(screen, /no de un historial/u);
  assert.match(screen, /data\.generatedAt/u);
});

test("stats API is authenticated and owned by session identity", () => {
  const api = file("../src/features/resources/resource-owner-stats-api.ts");
  const runtime = file("../src/features/resources/resource-runtime.ts");
  assert.match(api, /\/resources\/mine\/stats/u);
  assert.match(api, /isCredentialAuthoritative/u);
  assert.doesNotMatch(api, /[?&]authorUserId=/u);
  assert.match(runtime, /mobileOwnerStatisticsApi/u);
});

test("stats backend filters out other authors and hidden publications", () => {
  const controller = file(
    "../../api/src/resources/resources.controller.ts",
  );
  const mongo = file(
    "../../api/src/resources/mongo/mongo-resource.store.ts",
  );
  assert.match(controller, /@Get\('mine\/stats'\)/u);
  assert.match(controller, /this\.resources\.getOwnedStatistics\(request\.user\.id\)/u);
  assert.match(mongo, /authorUserId,/u);
  assert.match(mongo, /moderationState: 'available'/u);
  assert.match(mongo, /\$lookup:/u);
});
