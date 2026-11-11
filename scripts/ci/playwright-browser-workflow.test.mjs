import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(".github/workflows/ci.yml", "utf8");
const browser = await readFile("scripts/ci/playwright-browser-preflight.mjs", "utf8");
const root = JSON.parse(await readFile("package.json", "utf8"));

const smokeIndex = workflow.indexOf("  runtime-smoke:");
assert.ok(smokeIndex > 0, "The verify workflow must still have runtime smoke");
const smoke = workflow.slice(smokeIndex);

test("browser remains an exact-version browser smoke prerequisite", () => {
  assert.equal(root.devDependencies.playwright, "1.63.0");
  assert.match(smoke, /runs-on: ubuntu-22\.04/u);
  assert.match(smoke, /pnpm install --frozen-lockfile/u);
  assert.match(smoke, /pnpm exec playwright install chromium/u);
  assert.doesNotMatch(smoke, /playwright install --with-deps/u);
  assert.doesNotMatch(smoke, /apt-get|apt install/u);
  assert.doesNotMatch(smoke, /continue-on-error: true/u);
  assert.match(smoke, /browser download failed; refusing to skip browser smoke/u);
});

test("missing Linux libraries or broken browser cannot be skipped", () => {
  const install = smoke.indexOf("pnpm exec playwright install chromium");
  const preflight = smoke.indexOf(
    "node scripts/ci/playwright-browser-preflight.mjs",
  );
  const compose = smoke.indexOf(
    "docker compose -f compose.local.yml -f compose.health.yml up --build",
  );
  const browserTest = smoke.indexOf("pnpm test:auth-browser-e2e");
  assert.ok(install >= 0);
  assert.ok(preflight > install);
  assert.ok(compose > preflight);
  assert.ok(browserTest > compose);
  assert.match(browser, /chromium.*from "playwright"/u);
  assert.match(browser, /browserType\.launch\(\{ headless: true \}\)/u);
  assert.match(browser, /page\.setContent\(/u);
  assert.match(browser, /page\.evaluate\(/u);
  assert.match(browser, /assert\.equal\(/u);
  assert.match(browser, /process\.exitCode = 1/u);
  assert.doesNotMatch(browser, /webkit|firefox|executablePath|system-chromium/u);
});

test("runtime prerequisites and original probes remain mandatory", () => {
  for (const required of [
    "node scripts/ci/check-mongo-kernel.mjs",
    "docker compose -f compose.local.yml -f compose.health.yml config --quiet",
    "mongo:8.0",
    "axllent/mailpit:v1.31.1",
    "rustfs/rustfs:1.0.0-rc.6",
    "rustfs/rc:v0.1.30",
    "pnpm test:auth-browser-e2e",
    "node scripts/smoke-api-runtime.mjs",
    "node scripts/smoke-auth-lifecycle.mjs",
    "node scripts/smoke-account-export-lifecycle.mjs",
    "docker compose -f compose.local.yml -f compose.health.yml down --volumes --remove-orphans",
  ]) {
    assert.ok(smoke.includes(required), "Required runtime step missing: " + required);
  }
  assert.match(smoke, /if: failure\(\)/u);
  assert.match(smoke, /if: always\(\)/u);
  assert.match(workflow, /Production dependency audit/u);
});
