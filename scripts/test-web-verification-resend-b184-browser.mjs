import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5194";
const API = "http://127.0.0.1:4000";
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");

async function boot() {
  const child = spawn(process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5194", "--strictPort"],
    {
      cwd: resolve(ROOT, "apps/web"),
      env: { ...process.env, CI: "true", VITE_API_BASE_URL: API },
      stdio: ["ignore", "pipe", "pipe"],
    });
  let logs = "";
  let exited = false;
  child.on("exit", () => { exited = true; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", chunk => { logs = (logs + chunk.toString()).slice(-3500); });
  }
  for (let attempt = 0; attempt < 120; attempt++) {
    if (exited) throw new Error("Vite exited: " + logs);
    try {
      const response = await fetch(ORIGIN + "/verify-email/pending", {
        signal: AbortSignal.timeout(750),
      });
      if (response.ok) return child;
    } catch {
      // Only loopback health checking.
    }
    await delay(250);
  }
  child.kill("SIGTERM");
  throw new Error("Vite startup failed: " + logs);
}
async function shutdown(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([exited, delay(2500)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  let child, browser;
  try {
    child = await boot();
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const calls = [];
    let nextStatus = 200;

    await ctx.route(API + "/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const headers = {
        "access-control-allow-origin": ORIGIN,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      };
      if (method === "OPTIONS") {
        return route.fulfill({ status: 204, headers });
      }
      if (method === "GET" && path === "/auth/me") {
        return route.fulfill({
          status: 401, contentType: "application/json", headers,
          body: JSON.stringify({ code: "AUTHENTICATION_REQUIRED" }),
        });
      }
      if (method === "POST" && path === "/auth/email-verification/request") {
        const payload = JSON.parse(request.postData() ?? "null");
        calls.push(payload);
        const status = nextStatus;
        nextStatus = 200;
        // Keep the first request in-flight to expose rapid double-submits.
        if (calls.length === 1) await delay(300);
        return route.fulfill({
          status, contentType: "application/json", headers,
          body: JSON.stringify(status === 200
            ? { accepted: true }
            : { code: "RATE_LIMITED", message: "Try again later" }),
        });
      }
      throw new Error("Unexpected auth request: " + method + " " + path);
    });

    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-01-01T10:00:00Z") });
    await page.goto(ORIGIN + "/verify-email/pending", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Verificá tu email" })
      .waitFor({ timeout: 15000 });
    const input = page.getByLabel("Email", { exact: true });
    const submit = page.getByRole("button", { name: "Reenviar email" });
    assert.equal(await submit.isDisabled(), true);
    assert.equal(calls.length, 0, "should never send an email on mounting");

    await input.fill("student@example.edu");
    assert.equal(await submit.isEnabled(), true);
    await page.evaluate(() => {
      const form = document.querySelector("form.auth-form");
      if (!(form instanceof HTMLFormElement)) throw new Error("Form missing");
      form.requestSubmit();
      form.requestSubmit();
    });
    await page.locator("[data-verification-wait]").waitFor();
    assert.equal(calls.length, 1, "two synchronous submissions emitted two POSTs");
    assert.deepEqual(calls[0], { email: "student@example.edu" });
    assert.equal(await submit.isDisabled(), true);
    assert.match(await page.locator("[data-verification-wait]").innerText(), /60 segundos/u);

    await page.evaluate(() => {
      const form = document.querySelector("form.auth-form");
      if (!(form instanceof HTMLFormElement)) throw new Error("Form missing");
      form.requestSubmit();
    });
    assert.equal(calls.length, 1, "cooldown bypassed via programmatic submit");

    await input.fill("alternate@example.edu");
    await page.getByRole("button", { name: "Reenviar email" }).click();
    await page.locator("[data-verification-wait]").waitFor();
    assert.equal(calls.length, 2, "corrected address could not resend");

    // Switching back to the first address must preserve that address's wait.
    await input.fill("student@example.edu");
    assert.equal(await page.getByRole("button", { name: "Reenviar email" })
      .isDisabled(), true);
    await page.clock.fastForward(61_000);
    await page.waitForFunction(() =>
      !document.querySelector("[data-verification-wait]"));
    await page.getByRole("button", { name: "Reenviar email" }).click();
    await page.locator("[data-verification-wait]").waitFor();
    assert.equal(calls.length, 3);

    await input.fill("limited@example.edu");
    nextStatus = 429;
    await page.getByRole("button", { name: "Reenviar email" }).click();
    await page.getByRole("alert").getByText(
      "Hiciste varios intentos.", { exact: false },
    ).waitFor();
    assert.equal(calls.length, 4);
    assert.equal(await page.locator("[data-verification-wait]").count(), 0,
      "client invented a successful cooldown after server rejection");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Verificá tu email" }).waitFor();
    assert.equal(await page.locator("[data-verification-wait]").count(), 0,
      "ephemeral cooldown was persisted across page reload");
    assert.equal(await input.inputValue(), "");
    assert.equal(calls.length, 4);
    await ctx.close();

    console.log("PASS B184 Chromium: explicit submit, same-tick dedup, 60s wait, corrected email, old email wait, 429 error and reload reset");
  } finally {
    await browser?.close();
    await shutdown(child);
  }
}
await main();
