import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = "http://127.0.0.1:5192";
const API = "http://127.0.0.1:4000";
const ROOT = process.cwd();
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
const SUBJECT = "104b311b-852c-497d-982c-4d8146a9874a";
const QUESTION_ONE = "67fe8f36-2c8d-4c85-897d-46702ebf127a";
const QUESTION_TWO = "7ea090ad-a87a-4fce-99a9-948b7a223e56";
const AUTH = {
  user: { id: "6f421f06-1cc0-49c1-96c7-3325c5a3edc7", email: "b182@example.invalid" },
  session: {
    id: "b3f1c920-f2c4-41ac-984b-1c0da61c92b7",
    clientType: "web",
    createdAt: "2026-01-01T10:00:00Z",
    lastSeenAt: "2026-01-01T10:00:00Z",
    expiresAt: "2027-01-01T10:00:00Z",
    current: true,
  },
};
const questions = [QUESTION_ONE, QUESTION_TWO].map((id, index) => ({
  id,
  subjectId: SUBJECT,
  title: "Pregunta de prueba " + (index + 1),
  body: "Explicá la solución de prueba " + (index + 1),
  state: "open",
  answerCount: 1,
  acceptedAnswerId: null,
  revision: 1,
  author: { displayName: "Estudiante de prueba" },
}));

async function startVite() {
  const child = spawn(process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5192", "--strictPort"], {
      cwd: resolve(ROOT, "apps/web"),
      env: { ...process.env, VITE_API_BASE_URL: API, CI: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  let logs = "";
  let exit = false;
  child.on("exit", () => { exit = true; });
  child.stdout.on("data", (b) => { logs = (logs + b.toString()).slice(-2000); });
  child.stderr.on("data", (b) => { logs = (logs + b.toString()).slice(-2000); });
  for (let i = 0; i < 120; i++) {
    if (exit) throw new Error("Vite exited: " + logs);
    try {
      if ((await fetch(ORIGIN + "/study/practice", {
        signal: AbortSignal.timeout(1000),
      })).ok) return child;
    } catch {
      // Local server is not ready yet.
    }
    await delay(250);
  }
  child.kill("SIGTERM");
  throw new Error("Vite did not start: " + logs);
}
async function stopVite(child) {
  if (!child || child.exitCode !== null) return;
  const ended = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([ended, delay(3000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  let child, browser;
  try {
    child = await startVite();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ reducedMotion: "reduce" });
    let authenticated = true;
    let unexpectedWrites = 0;

    await context.route(API + "/**", async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      const response = (status, value) => route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": ORIGIN,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify(value),
      });
      if (method !== "GET") {
        unexpectedWrites++;
        return response(405, { code: "METHOD_NOT_ALLOWED" });
      }
      if (url.pathname === "/auth/me") {
        return response(authenticated ? 200 : 401,
          authenticated ? AUTH : { code: "AUTHENTICATION_REQUIRED" });
      }
      if (url.pathname === "/discovery/contextual") {
        return response(200, { subjects: [{
          subject: { id: SUBJECT, name: "Álgebra" }, resources: [],
        }] });
      }
      if (url.pathname === "/questions") {
        return response(200, { items: questions, nextCursor: null });
      }
      const hit = questions.find(x => url.pathname === "/questions/" + x.id);
      if (hit) {
        return response(200, {
          question: hit,
          answers: [{
            id: "fde699c9-1f29-4d46-bfd6-dc10d3630b1a",
            body: "Respuesta de la comunidad",
            author: { displayName: "Participante" },
          }],
          answersNextCursor: null,
        });
      }
      return response(404, { code: "NOT_FOUND", message: "Route not mocked" });
    });

    const page = await context.newPage();
    await page.goto(ORIGIN + "/study/practice?subjectId=" + SUBJECT,
      { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Practicar las primeras 5" })
      .waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Practicar las primeras 5" }).click();
    const round = page.locator('section[aria-labelledby="study-practice-round"]');
    await round.getByRole("heading", { name: "Pregunta de prueba 1" })
      .waitFor({ timeout: 15000 });

    await page.keyboard.press("Shift+K");
    assert.ok(await round.getByText("Pregunta 1 de 2").isVisible(),
      "shortcut should be disabled by default");

    await round.getByRole("button", { name: "Activar atajos" }).click();
    assert.equal(await round.getByRole("button", { name: "Desactivar atajos" })
      .getAttribute("aria-pressed"), "true");
    await round.locator("textarea").fill("Mi propia explicación");
    await round.locator("textarea").press("Shift+K");
    assert.ok(await round.getByText("Pregunta 1 de 2").isVisible(),
      "typing must not navigate away from question");
    assert.ok((await round.locator("textarea").inputValue()).startsWith("Mi propia explicación"),
      "typing must be preserved");

    await round.getByRole("heading", { name: "Pregunta de prueba 1" }).click();
    await page.keyboard.press("Shift+K");
    await round.getByRole("heading", { name: "Pregunta de prueba 2" })
      .waitFor({ timeout: 15000 });

    await page.keyboard.press("Shift+R");
    await round.getByText("Respuesta de la comunidad", { exact: true })
      .waitFor({ timeout: 15000 });
    await page.keyboard.press("Shift+J");
    await round.getByRole("heading", { name: "Pregunta de prueba 1" })
      .waitFor({ timeout: 15000 });

    await round.getByRole("button", { name: "Desactivar atajos" }).click();
    await page.keyboard.press("Shift+K");
    assert.ok(await round.getByText("Pregunta 1 de 2").isVisible(),
      "shortcut must stop as soon as opted out");

    authenticated = false;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForURL(ORIGIN + "/login", { timeout: 15000 });
    assert.equal(await page.locator(".study-practice-shortcuts").count(), 0);
    assert.equal(unexpectedWrites, 0);
    await context.close();
    console.log("PASS B182 Chromium: opt-in, editable isolation, next/reveal/back, opt-out and auth-loss");
  } finally {
    await browser?.close();
    await stopVite(child);
  }
}
await main();
