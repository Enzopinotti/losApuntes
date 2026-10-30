import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(
  new URL("../src/features/search/search-result-screens.tsx", import.meta.url),
  "utf8",
);

test("public profile uses only the server-projected avatar alongside its name", () => {
  assert.match(screen, /<PublicProfileAvatar\b/u);
  assert.match(screen, /avatarUrl=\{data\.profile\.about\?\.avatarUrl\}/u);
  assert.match(screen, /displayName=\{data\.profile\.about\?\.displayName/u);
});
