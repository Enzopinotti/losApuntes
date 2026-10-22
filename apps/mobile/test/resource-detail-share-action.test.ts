import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("resource detail offers the permission-neutral resource share action", () => {
  const screen = file(
    "../src/features/resources/resource-details-screen.tsx",
  );
  const action = file("../src/features/resources/resource-share-action.tsx");
  const actionCard = screen.slice(
    screen.indexOf('<Text accessibilityRole="header" style={styles.sectionTitle}>'),
    screen.indexOf("{currentAction?.notice === \"unsaved\"}"),
  );

  assert.match(screen, /import \{ MobileResourceShareAction \} from/u);
  assert.match(
    actionCard,
    /<MobileResourceShareAction\s+key=\{resource\.id\}\s+resourceId=\{resource\.id\}\s+resourceTitle=\{resource\.title\}\s*\/>/u,
  );
  assert.match(action, /accessibilityHint=.*El enlace no concede acceso/u);
  assert.match(action, /Share\.share\(\{ message: payload\.message \}\)/u);
});

