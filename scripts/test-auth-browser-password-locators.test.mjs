import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL("../" + relativePath, import.meta.url), "utf8");

const [browser, field] = await Promise.all([
  read("scripts/auth-browser-e2e.mjs"),
  read("apps/web/src/features/auth/PasswordField.tsx"),
]);

test("B193 all password browser labels target the exact input, not reveal buttons", () => {
  const locators = [
    ...browser.matchAll(
      /\.getByLabel\("(?:Contraseña|Confirmar contraseña|Nueva contraseña)"(?:,\s*\{[^}]*\})?\)/gu,
    ),
  ].map((match) => match[0]);
  assert.ok(locators.length >= 8, "password browser coverage must not shrink silently");
  for (const locator of locators) {
    assert.match(
      locator,
      /,\s*\{\s*exact:\s*true,?\s*\}\)/u,
      "ambiguous password locator detected",
    );
  }
});

test("B193 initial and post-recovery login have exact accessible input labels", () => {
  assert.match(
    browser,
    /const loginPassword = page\.getByLabel\("Contraseña",\s*\{\s*exact:\s*true\s*\}\)/u,
  );
  assert.match(
    browser,
    /const recoveredLoginPassword = page\.getByLabel\("Contraseña",\s*\{\s*exact:\s*true,?\s*\}\)/u,
  );
});

test("B193 browser smoke exercises reveal and reconceal without removing accessibility", () => {
  assert.match(browser, /name: "Mostrar contraseña",\s*exact: true/u);
  assert.match(browser, /name: "Ocultar contraseña", exact: true/u);
  assert.match(browser, /await revealLoginPassword\.click\(\)/u);
  assert.match(browser, /await loginPassword\.getAttribute\("type"\), "text"/u);
  assert.match(browser, /await loginPassword\.getAttribute\("type"\), "password"/u);

  assert.match(field, /aria-controls=\{id\}/u);
  assert.match(field, /aria-pressed=\{visible\}/u);
  assert.match(field, /type=\{visible \? "text" : "password"\}/u);
  assert.match(field, /onClick=\{\(\) => setRevealed/u);
});
