import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [store, controller, client, deepLinks, app, pkg] = await Promise.all([
  read("apps/mobile/src/platform/session-credential-store.ts"),
  read("apps/mobile/src/features/session/session-controller.ts"),
  read("apps/mobile/src/services/api/client.ts"),
  read("apps/mobile/src/features/auth/auth-deep-link.ts"),
  read("apps/mobile/app.json"),
  read("apps/mobile/package.json"),
]);

assert.match(store, /expo-secure-store/u);
assert.match(store, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/u);
assert.doesNotMatch(
  `${store}\n${controller}`,
  /AsyncStorage|localStorage|sessionStorage|react-native-mmkv/u,
);
assert.match(client, /redirect:\s*"error"/u);
assert.match(client, /CROSS_ORIGIN_REQUEST_BLOCKED/u);
assert.doesNotMatch(client, /console\.(?:log|warn|error)|searchParams\.set\([^)]*(?:token|credential|authorization)/iu);
assert.match(controller, /generation/u);
assert.match(controller, /bestEffortRevokeCandidate/u);
assert.match(deepLinks, /url\.protocol\s*!==\s*"losapuntes:"/u);
assert.match(deepLinks, /ACTION_TOKEN_PATTERN/u);

const appJson = JSON.parse(app);
assert.equal(appJson.expo.scheme, "losapuntes");
assert.ok(appJson.expo.plugins.includes("expo-secure-store"));
assert.equal(appJson.expo.experiments.typedRoutes, true);

const packageJson = JSON.parse(pkg);
assert.equal(packageJson.dependencies["@losapuntes/contracts"], "workspace:*");
assert.ok(packageJson.dependencies["expo-secure-store"]);
