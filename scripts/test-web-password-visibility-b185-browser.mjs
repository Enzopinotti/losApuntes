import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5195";
const API = "http://127.0.0.1:4000";
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
const auth = {
  user: { id: "6f421f06-1cc0-49c1-96c7-3325c5a3edc7", email: "student@example.invalid" },
  session: {
    id: "b3f1c920-f2c4-41ac-984b-1c0da61c92b7",
    clientType: "web",
    createdAt: "2026-01-01T10:00:00Z",
    lastSeenAt: "2026-01-01T10:00:00Z",
    expiresAt: "2027-01-01T10:00:00Z",
    current: true,
  },
};

async function boot() {
  const child = spawn(process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5195", "--strictPort"], {
      cwd: resolve(ROOT, "apps/web"),
      env: { ...process.env, CI: "true", VITE_API_BASE_URL: API },
      stdio: ["ignore", "pipe", "pipe"],
    });
  let output = "";
  let exited = false;
  child.on("exit", () => { exited = true; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (b) => { output = (output + b.toString()).slice(-2500); });
  }
  for (let i = 0; i < 120; i++) {
    if (exited) throw new Error("Vite exited: " + output);
    try {
      if ((await fetch(ORIGIN + "/login", {
        signal: AbortSignal.timeout(750),
      })).ok) return child;
    } catch {
      // Local server startup only.
    }
    await delay(250);
  }
  child.kill("SIGTERM");
  throw new Error("Vite did not start: " + output);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const ended = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([ended, delay(2500)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function checkField(page, id, value, label) {
  const field = page.locator("#" + id);
  await field.waitFor({ timeout: 15_000 });
  assert.equal(await field.getAttribute("type"), "password");
  await field.fill(value);
  const wrapper = field.locator("..");
  const show = wrapper.getByRole("button", { name: "Mostrar " + label });
  assert.equal(await show.getAttribute("type"), "button");
  assert.equal(await show.getAttribute("aria-controls"), id);
  assert.equal(await show.getAttribute("aria-pressed"), "false");
  await show.click();
  assert.equal(await field.getAttribute("type"), "text");
  assert.equal(await field.inputValue(), value, "toggle changed secret value");
  const hide = wrapper.getByRole("button", { name: "Ocultar " + label });
  assert.equal(await hide.getAttribute("aria-pressed"), "true");
  return { field, hide };
}

async function main() {
  let child, browser;
  try {
    child = await boot();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ reducedMotion: "reduce" });
    let authenticated = false;
    let unexpectedWrites = 0;
    const expectedRequests = [];

    await context.route(API + "/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname;
      const method = req.method();
      const headers = {
        "access-control-allow-origin": ORIGIN,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      };
      const reply = (status, payload) => route.fulfill({
        status, contentType: "application/json", headers,
        body: JSON.stringify(payload),
      });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (path === "/auth/me" && method === "GET") {
        return reply(authenticated ? 200 : 401,
          authenticated ? auth : { code: "AUTHENTICATION_REQUIRED" });
      }
      if (path === "/auth/google/status" && method === "GET") {
        return reply(200, { webEnabled: false, mobileEnabled: false });
      }
      if (path === "/auth/password/recovery/inspect" && method === "POST") {
        expectedRequests.push({ path, method });
        return reply(200, { recovery: { available: true } });
      }
      if (authenticated && path === "/auth/sessions" && method === "GET") {
        return reply(200, { sessions: [auth.session], truncated: false, limit: 20 });
      }
      if (authenticated && path === "/auth/login-methods" && method === "GET") {
        return reply(200, { passwordConfigured: true, googleConnected: true });
      }
      if (method !== "GET") unexpectedWrites++;
      return reply(404, { code: "NOT_FOUND" });
    });

    const page = await context.newPage();

    // React Hook Form ref + autofill + text content must survive toggling.
    await page.goto(ORIGIN + "/login", { waitUntil: "domcontentloaded" });
    const login = await checkField(page, "login-password",
      "test password from autofill", "contraseña");
    assert.equal(await login.field.getAttribute("autocomplete"), "current-password");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(await login.field.getAttribute("type"), "password");
    assert.equal(await login.field.inputValue(), "test password from autofill");

    // Signup has two independent credentials; revealing one must not reveal the other.
    await page.goto(ORIGIN + "/sign-up", { waitUntil: "domcontentloaded" });
    const newPassword = await checkField(page, "signup-password",
      "Passphrase with spaces 2026", "contraseña");
    const confirm = page.locator("#signup-confirm-password");
    assert.equal(await confirm.getAttribute("type"), "password");
    const confirmed = await checkField(page, "signup-confirm-password",
      "Passphrase with spaces 2026", "confirmar contraseña");
    await newPassword.hide.click();
    assert.equal(await newPassword.field.getAttribute("type"), "password");
    assert.equal(await confirmed.field.getAttribute("type"), "text");
    assert.equal(await newPassword.field.getAttribute("autocomplete"), "new-password");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(await confirmed.field.getAttribute("type"), "password");

    // The recovery token is inspected via the original service, then scrubbed
    // from the browser address, without being copied or sent to a new endpoint.
    const token = "t".repeat(43);
    await page.goto(ORIGIN + "/auth/reset-password#token=" + token,
      { waitUntil: "domcontentloaded" });
    await page.locator("#reset-password").waitFor({ timeout: 15_000 });
    assert.ok(!page.url().includes(token), "recovery token left in URL");
    const reset = await checkField(page, "reset-password",
      "Passphrase for reset 2026", "nueva contraseña");
    const resetConfirm = page.locator("#reset-password-confirm");
    assert.equal(await resetConfirm.getAttribute("type"), "password");
    await reset.hide.click();
    assert.equal(await reset.field.getAttribute("type"), "password");
    assert.deepEqual(expectedRequests, [{
      path: "/auth/password/recovery/inspect", method: "POST",
    }]);

    // Protected Security route: existing authority and change controls remain.
    authenticated = true;
    await page.goto(ORIGIN + "/settings/security", {
      waitUntil: "domcontentloaded",
    });
    await page.locator("#security-current-password").waitFor({ timeout: 15_000 });
    const original = await checkField(page, "security-current-password",
      "Current phrase 2026", "contraseña actual");
    for (const id of ["security-new-password",
      "security-confirm-password", "google-reauth-password"]) {
      await page.locator("#" + id).waitFor({ timeout: 15_000 });
      assert.equal(await page.locator("#" + id).getAttribute("type"),
        "password", "revealing current password revealed other fields");
    }
    await original.hide.click();
    assert.equal(await original.field.getAttribute("type"), "password");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(await page.locator("#security-current-password")
      .getAttribute("type"), "password");
    assert.equal(unexpectedWrites, 0,
      "visibility button must never initiate password operations");
    await context.close();
    console.log("PASS B185 Chromium: login/registration/recovery/security opt-in masking, independent controls, blur conceal, no credential mutations");
  } finally {
    await browser?.close();
    await stop(child);
  }
}
await main();
