import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL("../" + relativePath, import.meta.url), "utf8");

const [browser, dashboard] = await Promise.all([
  read("scripts/auth-browser-e2e.mjs"),
  read("apps/web/src/pages/Dashboard.tsx"),
]);

test("B194 browser asserts the current authenticated dashboard heading", () => {
  assert.match(
    dashboard,
    /<h1 id="dashboard-title">¿Qué querés hacer hoy\?<\/h1>/u,
    "Dashboard must declare its actual visible, semantic H1",
  );
  assert.match(
    browser,
    /getByRole\("heading", \{ name: "¿Qué querés hacer hoy\?", exact: true \}\)/u,
    "browser navigation must assert current dashboard H1 by accessible role",
  );
  assert.doesNotMatch(
    browser,
    /Tu espacio en Los Apuntes/u,
    "obsolete heading must not mask a successful authenticated login",
  );
  assert.match(browser, /await page\.waitForURL\(\(url\) => url\.pathname === "\/dashboard"\)/u);
});

test("B194 preserves server-backed login and cookie security assertions", () => {
  assert.match(browser, /loginResponse\.status\(\), 200/u);
  assert.match(browser, /Object\.hasOwn\(loginSnapshot, "sessionToken"\)/u);
  assert.match(browser, /sessionCookie\.httpOnly/u);
  assert.match(browser, /sessionCookie\.secure/u);
  assert.match(browser, /sessionCookie\.sameSite/u);
  assert.match(browser, /await authenticatedMe\(page\)/u);
});

test("B194 preserves exact labels and keyboard reachability for visible password toggle", () => {
  assert.match(
    browser,
    /const loginPassword = page\.getByLabel\("Contraseña", \{ exact: true \}\)/u,
  );
  assert.match(browser, /Tab should reach the accessible password visibility control/u);
  assert.match(browser, /keyboard traversal should reach the login action/u);
  assert.match(browser, /name: "Mostrar contraseña",\s*exact: true/u);
  assert.match(browser, /name: "Ocultar contraseña", exact: true/u);
});
