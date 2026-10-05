import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_TAB_ROUTES,
  activeNavigationAuthorityKey,
  navigationAuthorityKey,
} from "../src/features/navigation/product-navigation";

test("exposes the product tabs in their canonical order", () => {
  assert.deepEqual(PRODUCT_TAB_ROUTES, [
    "home",
    "search",
    "create",
    "network",
    "profile",
  ]);
  assert.equal(new Set(PRODUCT_TAB_ROUTES).size, PRODUCT_TAB_ROUTES.length);
});

test("changes the navigation scope when session authority changes", () => {
  const first = navigationAuthorityKey("user-a", "session-1");
  const same = navigationAuthorityKey("user-a", "session-1");
  const nextSession = navigationAuthorityKey("user-a", "session-2");
  const nextPrincipal = navigationAuthorityKey("user-b", "session-1");

  assert.equal(first, same);
  assert.notEqual(first, nextSession);
  assert.notEqual(first, nextPrincipal);
});

test("active screen authority requires focus and an active AppState", () => {
  assert.equal(
    activeNavigationAuthorityKey("user-a:session-1", true, "active"),
    "user-a:session-1",
  );
  assert.equal(
    activeNavigationAuthorityKey("user-a:session-1", false, "active"),
    null,
  );
  assert.equal(
    activeNavigationAuthorityKey("user-a:session-1", true, "background"),
    null,
  );
  assert.equal(
    activeNavigationAuthorityKey("user-a:session-1", true, "inactive"),
    null,
  );
  assert.equal(activeNavigationAuthorityKey(null, true, "active"), null);
});
