import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = "http://127.0.0.1:5187";
const API_ORIGIN = "http://127.0.0.1:4000";
const ROOT = process.cwd();
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
const AUTH_SNAPSHOT = {
  user: { id: "6f421f06-1cc0-49c1-96c7-3325c5a3edc7", email: "browser@example.invalid" },
  session: {
    id: "b3f1c920-f2c4-41ac-984b-1c0da61c92b7",
    clientType: "web",
    createdAt: "2026-01-01T10:00:00Z",
    lastSeenAt: "2026-01-01T10:00:00Z",
    expiresAt: "2027-01-01T10:00:00Z",
    current: true,
  },
};

async function bootWeb() {
  const child = spawn(process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5187", "--strictPort"],
    {
      cwd: resolve(ROOT, "apps/web"),
      env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN, CI: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  let output = "";
  let spawnError = null;
  let exited = false;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", chunk => { output = (output + chunk.toString()).slice(-3500); });
  }
  child.on("error", error => { spawnError = error; });
  child.on("exit", () => { exited = true; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (exited) throw new Error("Vite failed to start: " + output);
    try {
      const response = await fetch(ORIGIN + "/login", { signal: AbortSignal.timeout(1000) });
      if (response.ok) return child;
    } catch {
      // Vite not yet listening.
    }
    await delay(250);
  }
  child.kill("SIGTERM");
  throw new Error("Vite startup timeout: " + output);
}

async function stopWeb(child) {
  if (!child || child.exitCode !== null) return;
  let completed = false;
  const exited = new Promise(resolveExit =>
    child.once("exit", () => { completed = true; resolveExit(); }));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(2500)]);
  if (!completed) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(1000)]);
  }
}

async function newPage(browser, authenticated) {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route(API_ORIGIN + "/**", async route => {
    if (route.request().url().endsWith("/auth/me") && authenticated) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": ORIGIN,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify(AUTH_SNAPSHOT),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": ORIGIN,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify({ code: "AUTHENTICATION_REQUIRED", message: "Not authenticated" }),
      });
    }
  });
  return { context, page: await context.newPage() };
}

async function main() {
  let server;
  let browser;
  try {
    server = await bootWeb();
    browser = await chromium.launch({ headless: true });

    const guest = await newPage(browser, false);
    const secret = "DO_NOT_REFLECT_RECOVERY_TOKEN_B163";
    await guest.page.goto(
      ORIGIN + "/study/practice/unknown/" + secret + "?token=" + secret + "#" + secret,
      { waitUntil: "domcontentloaded" },
    );
    await guest.page.locator("#not-found-title").waitFor({ timeout: 12_000 });
    assert.match(await guest.page.locator("#not-found-title").innerText(),
      /No encontramos esta página/u);
    assert.equal(await guest.page.locator("main").count(), 1);
    const guestBody = await guest.page.locator("body").innerText();
    assert.ok(!guestBody.includes(secret), "unknown URL token leaked into text content");
    assert.equal(await guest.page.getByRole("link", { name: "Abrir mi panel académico" }).count(), 0);
    assert.equal(await guest.page.getByRole("link", { name: "Ir al inicio" }).getAttribute("href"), "/");
    assert.equal(await guest.page.getByRole("link", { name: "Explorar apuntes y materias" }).getAttribute("href"), "/search");

    await guest.page.getByRole("link", { name: "Explorar apuntes y materias" }).click();
    await guest.page.waitForURL(ORIGIN + "/search", { timeout: 10000 });
    assert.equal(await guest.page.locator("#not-found-title").count(), 0,
      "recovery must leave wildcard route");

    await guest.page.goto(ORIGIN + "/dashboard", { waitUntil: "domcontentloaded" });
    await guest.page.waitForURL(ORIGIN + "/login", { timeout: 12000 });
    assert.equal(await guest.page.locator("#not-found-title").count(), 0,
      "existing private routes must stay guarded");

    await guest.page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
    assert.equal(await guest.page.locator("#not-found-title").count(), 0,
      "valid home route must not be shadowed by wildcard");
    await guest.context.close();

    const member = await newPage(browser, true);
    await member.page.goto(ORIGIN + "/this-page-does-not-exist?token=" + secret,
      { waitUntil: "domcontentloaded" });
    await member.page.locator("#not-found-title").waitFor({ timeout: 12_000 });
    await member.page.getByRole("link", { name: "Abrir mi panel académico" })
      .waitFor({ timeout: 12000 });
    assert.ok(!(await member.page.locator("body").innerText()).includes(secret));
    assert.equal(await member.page.getByRole("link", { name: "Abrir mi panel académico" })
      .getAttribute("href"), "/dashboard");
    await member.context.close();

    console.log("PASS B163 Chromium: private URL non-disclosure, public recovery, nested fallback, guarded routes, member CTA");
  } finally {
    await browser?.close();
    await stopWeb(server);
  }
}

await main();
