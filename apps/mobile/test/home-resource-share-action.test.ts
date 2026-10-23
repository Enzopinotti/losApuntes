import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Home saved preview shares the currently authorized resource", () => {
  const card = file("../src/features/home/home-saved-return-card.tsx");
  const controller = file(
    "../src/features/home/home-saved-return-controller.ts",
  );
  const itemRows = card.slice(
    card.indexOf("current.items.map((resource) => {"),
    card.indexOf("{current.moreAvailable ?"),
  );

  assert.match(controller, /this\.api\.saved\(/u);
  assert.match(card, /snapshot\.authorityKey === authorityKey/u);
  assert.match(
    itemRows,
    /<MobileResourceShareAction\s+key=\{resource\.id\}\s+resourceId=\{resource\.id\}\s+resourceTitle=\{resource\.title\}\s*\/>/u,
  );
});

test("Home recent preview shares only resources reauthorized for this session", () => {
  const card = file("../src/features/home/home-recent-opened-card.tsx");
  const controller = file(
    "../src/features/home/home-recent-opened-controller.ts",
  );
  const itemRows = card.slice(
    card.indexOf("visibleItems.map((resource) => {"),
    card.indexOf("{current.moreAvailable && recentScope"),
  );

  assert.match(controller, /this\.api\.resource\(/u);
  assert.match(controller, /result\.resource\.id !== resourceId/u);
  assert.match(
    itemRows,
    /<MobileResourceShareAction\s+key=\{resource\.id\}\s+resourceId=\{resource\.id\}\s+resourceTitle=\{resource\.title\}\s*\/>/u,
  );
});
