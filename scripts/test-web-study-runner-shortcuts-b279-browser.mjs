import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5196";
const API = "http://127.0.0.1:4000";
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
const SUBJECT = "104b311b-852c-497d-982c-4d8146a9874a";
const QUESTIONS = [
  "67fe8f36-2c8d-4c85-897d-46702ebf127a",
  "7ea090ad-a87a-4fce-99a9-948b7a223e56",
];
const AUTH = {
  user: { id: "6f421f06-1cc0-49c1-96c7-3325c5a3edc7", email: "b279@example.invalid" },
  session: {
    id: "b3f1c920-f2c4-41ac-984b-1c0da61c92b7",
    clientType: "web",
    createdAt: "2026-01-01T10:00:00Z",
    lastSeenAt: "2026-01-01T10:00:00Z",
    expiresAt: "2027-01-01T10:00:00Z",
    current: true,
  },
};
const plan = {
  format: "losapuntes.study-session",
  version: 1,
  subjectId: SUBJECT,
  title: "Mi sesión B279",
  notes: "Prueba local sin escritura remota",
  startsAt: null,
  tasks: QUESTIONS.map((id) => ({
    kind: "question", id, minutes: 5, done: false,
  })),
};

async function start() {
  const child = spawn(process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5196", "--strictPort"], {
      cwd: resolve(ROOT, "apps/web"),
      env: { ...process.env, CI: "true", VITE_API_BASE_URL: API },
      stdio: ["ignore", "pipe", "pipe"],
    });
  let output = "";
  let exited = false;
  child.on("exit", () => { exited = true; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", chunk => { output = (output + chunk.toString()).slice(-2200); });
  }
  for (let i = 0; i < 120; i++) {
    if (exited) throw new Error("Vite exited: " + output);
    try {
      if ((await fetch(ORIGIN + "/study/run", {
        signal: AbortSignal.timeout(800),
      })).ok) return child;
    } catch { /* loopback-only readiness */ }
    await delay(250);
  }
  child.kill("SIGTERM");
  throw new Error("Vite readiness failed: " + output);
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const done = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([done, delay(3000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  let child, browser;
  try {
    child = await start();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ reducedMotion: "reduce" });
    let authenticated = true;
    let mutations = 0;
    await context.route(API + "/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const reply = (status, value) => route.fulfill({
        status, contentType: "application/json",
        headers: {
          "access-control-allow-origin": ORIGIN,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify(value),
      });
      if (method !== "GET") {
        mutations++;
        return reply(405, { code: "METHOD_NOT_ALLOWED" });
      }
      if (path === "/auth/me") {
        return reply(authenticated ? 200 : 401,
          authenticated ? AUTH : { code: "AUTHENTICATION_REQUIRED" });
      }
      if (path === "/discovery/contextual") {
        return reply(200, { subjects: [{
          subject: { id: SUBJECT, name: "Álgebra" }, resources: [],
        }] });
      }
      const index = QUESTIONS.findIndex((id) => path === "/questions/" + id);
      if (index !== -1) {
        return reply(200, {
          question: {
            id: QUESTIONS[index],
            title: "Actividad académica " + (index + 1),
            body: "Pregunta de prueba segura",
            state: "open",
            answerCount: 0,
            academic: { subject: { id: SUBJECT, name: "Álgebra" } },
          },
          answers: [],
          answersNextCursor: null,
        });
      }
      return reply(404, { code: "NOT_FOUND" });
    });

    const page = await context.newPage();
    await page.goto(ORIGIN + "/study/run?subjectId=" + SUBJECT,
      { waitUntil: "domcontentloaded" });
    await page.getByText("Importar una sesión JSON").waitFor({ timeout: 15000 });
    await page.locator('input[type="file"]').setInputFiles({
      name: "sesion-b279.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(plan)),
    });
    const runner = page.locator('section[aria-labelledby="study-run-current"]');
    await runner.getByRole("heading", { name: "Mi sesión B279" }).waitFor();
    await runner.getByText("Actividad académica 1").first().waitFor();

    await page.keyboard.press("Shift+K");
    assert.ok(await runner.getByText("Actividad 1 de 2", { exact: false }).isVisible(),
      "shortcuts should be disabled by default");

    const toggle = runner.getByRole("button", { name: "Activar atajos" });
    await toggle.click();
    assert.equal(await runner.getByRole("button", { name: "Desactivar atajos" })
      .getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Shift+K");
    await runner.getByText("Actividad académica 2").first().waitFor();

    // Focusing an editor must disable shortcuts, including a native select.
    const select = page.locator(".study-runner-review-filter select");
    await select.focus();
    await select.press("Shift+J");
    assert.ok(await runner.getByText("Actividad 2 de 2", { exact: false }).isVisible());

    await runner.getByRole("button", { name: "Desactivar atajos" }).focus();
    await page.keyboard.press("Shift+J");
    await runner.getByText("Actividad académica 1").first().waitFor();

    await page.keyboard.press("Shift+P");
    await runner.getByRole("button", { name: "Pausar", exact: true }).waitFor();
    await page.keyboard.press("Shift+P");
    await runner.getByRole("button", { name: "Iniciar o reanudar" }).waitFor();

    await runner.getByRole("button", { name: "Desactivar atajos" }).click();
    await page.keyboard.press("Shift+K");
    assert.ok(await runner.getByText("Actividad 1 de 2", { exact: false }).isVisible(),
      "disabled keyboard controller still navigated");

    authenticated = false;
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".study-runner-shortcuts").count(), 0);
    assert.equal(mutations, 0, "keyboard helper triggered remote state changes");

    await context.close();
    console.log("PASS B279 Chromium: opt-in, next/back, editable isolation, timer pause, disable and auth loss");
  } finally {
    await browser?.close();
    await stop(child);
  }
}
await main();
