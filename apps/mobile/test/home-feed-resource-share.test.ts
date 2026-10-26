import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function file(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function feedItemRow(): string {
  const screen = file("../src/features/home/home-screen.tsx");
  return screen.slice(
    screen.indexOf("function FeedItemRow("),
    screen.indexOf("function FeedSectionHeader("),
  );
}

test("Home feed shares only resource items from the current authorized snapshot", () => {
  const screen = file("../src/features/home/home-screen.tsx");
  const row = feedItemRow();

  assert.match(
    screen,
    /home\.kind === "ready" && home\.authorityKey === activeHomeAuthority/u,
  );
  assert.match(row, /item\.type === "resource" \?/u);
  assert.match(row, /<MobileResourceShareAction\b/u);
  assert.match(row, /resourceId=\{item\.id\}/u);
  assert.match(row, /resourceTitle=\{item\.title\}/u);
});

test("Home feed sharing is a sibling of opening the feed item", () => {
  const row = feedItemRow();
  const openActionEnd = row.indexOf("</Pressable>", row.indexOf("{action ? ("));
  const shareActionStart = row.indexOf("<MobileResourceShareAction");

  assert.ok(openActionEnd >= 0);
  assert.ok(shareActionStart > openActionEnd);
  assert.match(row, /accessibilityLabel=\{\s*reasonSummary\s*\?/u);
});
