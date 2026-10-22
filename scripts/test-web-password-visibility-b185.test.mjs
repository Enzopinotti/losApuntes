import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const file = (path) => readFile(path, "utf8");
const component = () => file("apps/web/src/features/auth/PasswordField.tsx");

test("B185 default visibility is always masked until a deliberate button action", async () => {
  const source = await component();
  assert.match(source, /useState\(false\)/u);
  assert.match(source, /type=\{visible \? "text" : "password"\}/u);
  assert.match(source, /onClick=\{\(\) => setRevealed\(\(current\) => !current\)\}/u);
});

test("B185 native input node and React Hook Form ref survive toggle", async () => {
  const source = await component();
  assert.match(source, /forwardRef<HTMLInputElement, Props>/u);
  assert.match(source, /<input\s+\{\.\.\.inputProps\}\s+id=\{id\}\s+ref=\{ref\}/u);
  assert.match(source, /type="button"/u);
  assert.doesNotMatch(source, /key=\{revealed\}/u);
});

test("B185 prevents shoulder-surfing on tab/window loss without saving secrets", async () => {
  const source = await component();
  assert.match(source, /window\.addEventListener\("blur", conceal\)/u);
  assert.match(source, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/u);
  assert.match(source, /document\.visibilityState !== "visible"/u);
  assert.match(source, /window\.removeEventListener\("blur", conceal\)/u);
  assert.match(source, /document\.removeEventListener\("visibilitychange", onVisibilityChange\)/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|fetch\(|axios|sendBeacon|console\./u);
});

test("B185 disabled sensitive fields cannot be left visible", async () => {
  const source = await component();
  assert.match(source, /const visible = revealed && !disabled/u);
  assert.match(source, /disabled=\{disabled\}/u);
});

test("B185 toggle announces its action and pressed state accessibly", async () => {
  const source = await component();
  assert.match(source, /aria-controls=\{id\}/u);
  assert.match(source, /aria-pressed=\{visible\}/u);
  assert.match(source, /aria-label=\{/u);
  assert.match(source, /Mostrar/u);
  assert.match(source, /Ocultar/u);
});

test("B185 login reuses native current-password autofill and RHF register", async () => {
  const source = await file("apps/web/src/features/auth/login/LoginForm.tsx");
  assert.match(source, /<PasswordField\s+id="login-password"\s+label="Contraseña"\s+autoComplete="current-password"/u);
  assert.match(source, /\{\.\.\.register\("password"/u);
  assert.equal((source.match(/<PasswordField/gu) || []).length, 1);
});

test("B185 signup maintains both passphrase fields and independent toggles", async () => {
  const source = await file("apps/web/src/features/auth/signup/SignUpForm.tsx");
  assert.equal((source.match(/<PasswordField/gu) || []).length, 2);
  assert.match(source, /id="signup-password"/u);
  assert.match(source, /id="signup-confirm-password"/u);
  assert.equal((source.match(/autoComplete="new-password"/gu) || []).length, 2);
  assert.match(source, /validate: newPasswordValidationMessage/u);
  assert.match(source, /value === password/u);
});

test("B185 reset does not touch token handling or password policy", async () => {
  const source = await file("apps/web/src/pages/ResetPassword.tsx");
  assert.equal((source.match(/<PasswordField/gu) || []).length, 2);
  assert.match(source, /readAuthActionToken/u);
  assert.match(source, /scrubAuthActionTokenFromHistory/u);
  assert.match(source, /newPasswordValidationMessage\(newPassword\)/u);
  assert.match(source, /newPassword !== confirmPassword/u);
  assert.match(source, /authApi\.completePasswordRecovery\(token, newPassword\)/u);
});

test("B185 security settings cover all four password entries without weakening authority", async () => {
  const source = await file("apps/web/src/pages/Security.tsx");
  assert.equal((source.match(/<PasswordField/gu) || []).length, 4);
  for (const id of [
    "security-current-password",
    "security-new-password",
    "security-confirm-password",
    "google-reauth-password",
  ]) assert.ok(source.includes('id="' + id + '"'));
  assert.match(source, /useAsyncAuthorityFence/u);
  assert.match(source, /disabled=\{busyAction !== null\}/u);
});

test("B185 mobile focus states and reduced motion remain readable", async () => {
  const css = await file("apps/web/src/features/auth/PasswordField.scss");
  assert.match(css, /min-height: 44px/u);
  assert.match(css, /focus-visible/u);
  assert.match(css, /max-width: 420px/u);
  assert.match(css, /prefers-reduced-motion/u);
});

test("B185 no password analytics or clipboard path is introduced by the feature", async () => {
  const source = await component();
  assert.doesNotMatch(source, /value\.|onChange|onInput|clipboard|navigator\.|console|analytics|fetch/u);
  assert.equal((source.match(/<input/gu) || []).length, 1);
});

test("B198 browser E2E password selectors do not match the reveal button", async () => {
  const source = await file("scripts/auth-browser-e2e.mjs");
  assert.match(
    source,
    /const loginPassword = page\.getByLabel\("Contraseña", \{ exact: true \}\);/u,
  );
  assert.match(
    source,
    /const recoveredLoginPassword = page\.getByLabel\("Contraseña", \{\s*exact: true,\s*\}\);/u,
  );
  assert.doesNotMatch(
    source,
    /getByLabel\("Contraseña"\)/u,
    "The reveal button has an accessible name containing contraseña",
  );
});
