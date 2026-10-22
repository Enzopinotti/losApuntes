import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  dashboardJourneys,
  dashboardJourneyById,
} from "../apps/web/src/features/dashboard/dashboardJourneys.ts";
import { searchSelectionHref } from "../apps/web/src/features/search/search-navigation.mjs";

const root = process.cwd();

test("B158 dashboard exposes four purposeful journeys backed by canonical routes", async () => {
  assert.deepEqual(
    dashboardJourneys.map((journey) => journey.id),
    ["study", "contribute", "community", "account"],
  );
  const routes = await readFile(
    path.join(root, "apps/web/src/app/routes.tsx"),
    "utf8",
  );
  const uniqueActionIds = new Set();
  const uniqueHrefs = new Set();

  for (const journey of dashboardJourneys) {
    assert.equal(dashboardJourneyById(journey.id), journey);
    assert.ok(journey.title.trim().length > 0);
    assert.ok(journey.description.trim().length > 0);
    assert.equal(journey.actions.length, 3);
    for (const action of journey.actions) {
      assert.ok(action.label.trim().length > 0);
      assert.ok(action.description.trim().length > 0);
      assert.match(action.href, /^\/[a-z/-]+$/u, "route must stay internal");
      assert.ok(!uniqueActionIds.has(action.id), "duplicate action id");
      assert.ok(!uniqueHrefs.has(action.href), "duplicate action route");
      uniqueActionIds.add(action.id);
      uniqueHrefs.add(action.href);
      const route = action.href.slice(1);
      assert.ok(
        routes.includes(`path: "${route}"`),
        `B158 action has no actual app route: ${action.href}`,
      );
    }
  }
  assert.equal(uniqueActionIds.size, 12);
});

test("B158 protected or unreleased study synchronization is never advertised", () => {
  const hrefs = dashboardJourneys.flatMap((journey) =>
    journey.actions.map((action) => action.href),
  );
  assert.ok(!hrefs.includes("/study-collections"));
  assert.ok(!hrefs.includes("/study-collections/recovery"));
  assert.ok(!hrefs.includes("/admin/pilot"));
  assert.ok(!hrefs.some((href) => href.startsWith("http")));
});

test("B158 search hands off through validated canonical public search URLs", () => {
  assert.equal(
    searchSelectionHref({ q: " Álgebra ", scope: "all" }),
    "/search?q=%C3%81lgebra",
  );
  for (const q of ["", " ", "a", "x".repeat(121), "math\nprivate"]) {
    assert.equal(searchSelectionHref({ q, scope: "all" }), null, q);
  }
  assert.equal(
    searchSelectionHref({ q: "Álgebra & práctica", scope: "all" }),
    "/search?q=%C3%81lgebra+%26+pr%C3%A1ctica",
  );
});

test("B158 accessible page uses native search, pressed options and no silent data transfer", async () => {
  const source = await readFile(
    path.join(root, "apps/web/src/pages/Dashboard.tsx"),
    "utf8",
  );
  assert.match(source, /role="search"/u);
  assert.match(source, /type="search"/u);
  assert.match(source, /aria-invalid=\{Boolean\(searchError\)\}/u);
  assert.match(source, /role="alert"/u);
  assert.match(source, /aria-pressed=\{activeJourney === journey\.id\}/u);
  assert.match(source, /searchSelectionHref\(\{ q: query, scope: "all" \}\)/u);
  assert.match(source, /event\.preventDefault\(\)/u);
  assert.match(source, /void navigate\(href\)/u);
  assert.match(source, /<Link to=\{action\.href\}/u);
  assert.doesNotMatch(
    source,
    /localStorage|sessionStorage|\.fetch\(|axios|dangerouslySetInnerHTML/u,
  );
  assert.doesNotMatch(source, /href=\{query\}|navigate\(query\)/u);
});

test("B158 responsive design honors touch, focus and reduced-motion preferences", async () => {
  const styles = await readFile(
    path.join(root, "apps/web/src/pages/Dashboard.scss"),
    "utf8",
  );
  assert.match(styles, /@media \(max-width: 800px\)/u);
  assert.match(styles, /@media \(max-width: 600px\)/u);
  assert.match(styles, /prefers-reduced-motion/u);
  assert.match(styles, /focus-visible/u);
  assert.match(styles, /min-height: 44px/u);
});
