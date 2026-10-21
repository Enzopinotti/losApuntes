import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5189";
const API = "http://127.0.0.1:4000";
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
const SUBJECT_A = "104b311b-852c-497d-982c-4d8146a9874a";
const SUBJECT_B = "8e4a8f43-4e3c-4af3-88df-37e8a5ac7937";
const SESSION = {
  user: { id: "6f421f06-1cc0-49c1-96c7-3325c5a3edc7", email: "b169@example.invalid" },
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
    [VITE, "--host", "127.0.0.1", "--port", "5189", "--strictPort"],
    {
      cwd: resolve(ROOT, "apps/web"),
      env: { ...process.env, CI: "true", VITE_API_BASE_URL: API },
      stdio: ["ignore", "pipe", "pipe"],
    });
  let output = "";
  let exited = false;
  let startError = null;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", chunk => { output = (output + chunk.toString()).slice(-3000); });
  }
  child.on("exit", () => { exited = true; });
  child.on("error", err => { startError = err; });
  const expires = Date.now() + 30000;
  while (Date.now() < expires) {
    if (startError) throw startError;
    if (exited) throw new Error("Vite exited: " + output);
    try {
      const response = await fetch(ORIGIN + "/study", { signal: AbortSignal.timeout(1000) });
      if (response.ok) return child;
    } catch {
      // Wait only for loopback readiness.
    }
    await delay(250);
  }
  child.kill("SIGTERM");
  throw new Error("Vite readiness timeout: " + output);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  let done = false;
  const exited = new Promise(resolveExit =>
    child.once("exit", () => { done = true; resolveExit(); }));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(2500)]);
  if (!done) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(1000)]);
  }
}

async function json(route, value, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": ORIGIN,
      "access-control-allow-credentials": "true",
    },
    body: JSON.stringify(value),
  });
}
async function main() {
  let server;
  let browser;
  try {
    server = await boot();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ reducedMotion: "reduce" });
    let denied = false;
    let outbound = 0;
    await context.route(API + "/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") {
        throw new Error("Focus feature must not create mutating API requests");
      }
      outbound++;
      if (path === "/auth/me") {
        await json(route, denied ? { code: "AUTHENTICATION_REQUIRED" } : SESSION, denied ? 401 : 200);
      } else if (path === "/discovery/contextual") {
        await json(route, {
          subjects: [
            { subject: { id: SUBJECT_A, name: "Análisis Matemático" }, resources: [] },
            { subject: { id: SUBJECT_B, name: "Álgebra" }, resources: [] },
          ],
        });
      } else if (
        path.includes("/saved") || path.includes("/resources") ||
        path.includes("/questions") || path.includes("/search")
      ) {
        await json(route, { items: [], nextCursor: null });
      } else {
        await json(route, { items: [], nextCursor: null });
      }
    });

    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-01-01T10:00:00Z") });
    await page.goto(ORIGIN + "/study?subjectId=" + SUBJECT_A, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Tiempo para concentrarte" })
      .waitFor({ timeout: 15000 });
    const panel = page.locator(".study-focus-card");
    const time = panel.locator("time");
    assert.equal(await time.innerText(), "25:00");
    assert.equal(await panel.getByRole("button", { name: "Estudiar · 25 min" })
      .getAttribute("aria-pressed"), "true");

    await panel.getByRole("button", { name: "Iniciar", exact: true }).click();
    await page.clock.fastForward(10_000);
    await page.waitForFunction(() =>
      document.querySelector(".study-focus-card time")?.textContent === "24:50");
    const beforePause = await time.innerText();
    await panel.getByRole("button", { name: "Pausar" }).click();
    await page.clock.fastForward(80_000);
    assert.equal(await time.innerText(), beforePause, "paused countdown advanced");

    await panel.getByRole("button", { name: "Reanudar" }).click();
    await page.clock.fastForward(1_490_000);
    await panel.getByText("Intervalo terminado.", { exact: false }).waitFor();
    assert.equal(await time.innerText(), "00:00");
    assert.equal(await panel.getByRole("button", { name: "Iniciar" }).count(), 0,
      "clock restarted without user consent");
    await panel.getByRole("button", { name: "Reiniciar intervalo" }).click();
    assert.equal(await time.innerText(), "25:00");

    await panel.getByRole("button", { name: "Descansar · 5 min" }).click();
    assert.equal(await time.innerText(), "05:00");
    await panel.getByRole("button", { name: "Iniciar", exact: true }).click();
    await page.clock.fastForward(5000);
    await page.waitForFunction(() =>
      document.querySelector(".study-focus-card time")?.textContent === "04:55");

    // Authenticated subject change must remount, discarding all clock state.
    await page.locator("#study-subject").selectOption(SUBJECT_B);
    await page.waitForURL(ORIGIN + "/study?subjectId=" + SUBJECT_B);
    await page.waitForFunction(() =>
      document.querySelector(".study-focus-card time")?.textContent === "25:00");
    assert.equal(await panel.getByRole("button", { name: "Iniciar" }).count(), 1);
    assert.ok(outbound > 0, "valid server context was never resolved");

    // Losing the account forces the PrivateRoute guard to remove the timer.
    denied = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForURL(ORIGIN + "/login", { timeout: 15000 });
    assert.equal(await page.locator(".study-focus-card").count(), 0);
    await context.close();
    console.log("PASS B169 Chromium real focus/rest controls, throttled timing, pause, owner-subject reset, auth loss");
  } finally {
    await browser?.close();
    await stop(server);
  }
}
await main();
