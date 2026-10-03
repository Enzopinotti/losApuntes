import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const dialog = await read(
  "apps/web/src/shared/components/ConfirmDialog.tsx",
);
const styles = await read(
  "apps/web/src/shared/components/ConfirmDialog.scss",
);
const security = await read("apps/web/src/pages/Security.tsx");

assert.match(dialog, /<dialog/u);
assert.match(dialog, /\.showModal\(\)/u);
assert.match(dialog, /onCancel=/u);
assert.match(dialog, /event\.preventDefault\(\)/u);
assert.match(dialog, /cancelButtonRef\.current\?\.focus\(\)/u);
assert.match(dialog, /returnFocusRef\?\.current\?\.focus\(\)/u);
assert.match(dialog, /autoFocus/u);
assert.match(dialog, /aria-labelledby/u);
assert.match(dialog, /aria-describedby/u);

assert.match(styles, /:focus-visible/u);
assert.match(styles, /prefers-reduced-motion/u);
assert.match(styles, /forced-colors/u);
assert.match(styles, /::backdrop/u);

assert.doesNotMatch(
  security,
  /window\.confirm/u,
  "Security must not rely on the browser confirm dialog",
);
assert.match(security, /<ConfirmDialog/u);
assert.match(security, /returnFocusRef=\{revokeAllButtonRef\}/u);
assert.match(security, /setRevokeAllConfirmOpen\(true\)/u);
assert.match(security, /authApi\.revokeAllSessions\(\)/u);

console.log("PASS Web accessible confirmation contract");
