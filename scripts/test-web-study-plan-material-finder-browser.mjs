import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5197";
const API = "http://127.0.0.1:4000";
const SUBJECT_ID = "c59a6dc1-557a-4ea3-9c23-e3a1ea9e76db";
const RESOURCE_ID = "fd3a1d96-c53f-4a44-9e91-1ddc9f63a098";
const REVOKED_RESOURCE_ID = "719683d9-1e89-4d8c-8d01-431e538e8b65";
const QUESTION_ID = "3f8f579b-4ea2-4f5d-9c9a-c4cbe4d93f14";
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
const auth = {
  user: {
    id: "6f421f06-1cc0-49c1-96c7-3325c5a3edc7",
    email: "student@example.invalid",
  },
  session: {
    id: "b3f1c920-f2c4-41ac-984b-1c0da61c92b7",
    clientType: "web",
    createdAt: "2026-01-01T10:00:00Z",
    lastSeenAt: "2026-01-01T10:00:00Z",
    expiresAt: "2027-01-01T10:00:00Z",
    current: true,
  },
};
const resource = {
  id: RESOURCE_ID,
  title: "Guía de derivadas",
  description: "Repaso de reglas y ejercicios.",
  tags: ["derivadas"],
  visibility: "public",
  author: { profileId: "8f32263e-46b5-4a45-b6d9-e5a56806f85d", displayName: "Ana", avatarUrl: null },
  academic: { subject: { id: SUBJECT_ID, name: "Matemática" }, courseOffering: null },
  file: { id: "31dec561-0d91-4be1-9714-8cfd05d181b9", filename: "derivadas.pdf", mimeType: "application/pdf", byteSize: 1000 },
  capabilities: { edit: false, manageShares: false },
  revision: 1,
  createdAt: "2026-01-01T10:00:00Z",
  updatedAt: "2026-01-01T10:00:00Z",
};
const question = {
  id: QUESTION_ID,
  title: "¿Cómo se obtiene la regla de la cadena?",
  state: "closed",
  academic: { subject: { id: SUBJECT_ID, name: "Matemática" }, courseOffering: null },
};

async function boot() {
  const child = spawn(
    process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5197", "--strictPort"],
    {
      cwd: resolve(ROOT, "apps/web"),
      env: { ...process.env, CI: "true", VITE_API_BASE_URL: API },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let exited = false;
  child.on("exit", () => { exited = true; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => { output = (output + chunk.toString()).slice(-2500); });
  }
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (exited) throw new Error("Vite exited: " + output);
    try {
      if ((await fetch(ORIGIN + "/study/session?subjectId=" + SUBJECT_ID, {
        signal: AbortSignal.timeout(750),
      })).ok) return child;
    } catch {
      // Wait for the loopback Vite server to start.
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

async function main() {
  let child, browser;
  let writes = 0;
  let resourceRechecks = 0;
  let questionRechecks = 0;
  const searches = [];
  try {
    child = await boot();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    await context.route(API + "/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const headers = {
        "access-control-allow-origin": ORIGIN,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      };
      const reply = (status, payload) => route.fulfill({
        status,
        contentType: "application/json",
        headers,
        body: JSON.stringify(payload),
      });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (method !== "GET") {
        writes += 1;
        return reply(405, { code: "METHOD_NOT_ALLOWED" });
      }
      if (path === "/auth/me") return reply(200, auth);
      if (path === "/auth/google/status") {
        return reply(200, { webEnabled: false, mobileEnabled: false });
      }
      if (path === "/discovery/contextual") {
        return reply(200, {
          subjects: [{ subject: { id: SUBJECT_ID, name: "Matemática" }, resources: [] }],
        });
      }
      if (path === "/resources/saved/search") {
        return reply(200, { items: [], nextCursor: null });
      }
      if (path === "/resources") {
        const q = url.searchParams.get("q") ?? "";
        if (!q) return reply(200, { items: [], nextCursor: null });
        searches.push({ kind: "resource", q });
        const items = q === "revocado"
          ? [{ ...resource, id: REVOKED_RESOURCE_ID, title: "Apunte revocado" }]
          : [{ id: RESOURCE_ID, title: resource.title, academic: resource.academic }];
        return reply(200, { items, nextCursor: null });
      }
      if (path === "/questions") {
        const q = url.searchParams.get("q") ?? "";
        if (!q) return reply(200, { items: [], nextCursor: null });
        searches.push({
          kind: "question",
          q,
          status: url.searchParams.get("status") ?? "",
        });
        return reply(200, {
          items: [{ id: QUESTION_ID, title: question.title, academic: question.academic }],
          nextCursor: null,
        });
      }
      if (path === "/resources/" + RESOURCE_ID) {
        resourceRechecks += 1;
        return reply(200, { resource });
      }
      if (path === "/resources/" + REVOKED_RESOURCE_ID) {
        resourceRechecks += 1;
        return reply(403, { code: "RESOURCE_FORBIDDEN" });
      }
      if (path === "/questions/" + QUESTION_ID) {
        questionRechecks += 1;
        return reply(200, { question });
      }
      return reply(404, { code: "NOT_FOUND" });
    });

    const pageErrors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(ORIGIN + "/study/session?subjectId=" + SUBJECT_ID, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Encontrar material para tu plan" })
      .waitFor({ timeout: 15_000 });

    await page.getByLabel("Nombre").fill("Plan de derivadas");
    await page.getByLabel("Notas personales (máximo 500 caracteres)")
      .fill("Conservar estas notas mientras agrego material.");

    await page.getByLabel("Buscar por tema").fill("derivadas");
    await page.getByRole("button", { name: "Buscar material" }).click();
    const addResource = page.getByRole("button", { name: "Sumar al plan" });
    await addResource.waitFor({ timeout: 15_000 });
    await addResource.click();
    await page.getByText("1 actividades", { exact: true }).waitFor({ timeout: 15_000 });
    assert.equal(await page.locator(".study-session-tasks").getByText(resource.title).count(), 1);
    assert.equal(await page.getByLabel("Notas personales (máximo 500 caracteres)").inputValue(),
      "Conservar estas notas mientras agrego material.");

    await page.getByLabel("Qué querés repasar").selectOption("question");
    await page.getByLabel("Estado de las preguntas").selectOption("closed");
    await page.getByLabel("Buscar por tema").fill("derivadas");
    await page.getByRole("button", { name: "Buscar material" }).click();
    const addQuestion = page.getByRole("button", { name: "Sumar al plan" });
    await addQuestion.waitFor({ timeout: 15_000 });
    await addQuestion.click();
    await page.getByText("2 actividades", { exact: true }).waitFor({ timeout: 15_000 });
    await page.getByText("45 minutos previstos", { exact: true }).waitFor({ timeout: 15_000 });
    assert.equal(await page.locator(".study-session-tasks").getByText(question.title).count(), 1);
    assert.equal(await page.getByLabel("Notas personales (máximo 500 caracteres)").inputValue(),
      "Conservar estas notas mientras agrego material.");

    await page.getByLabel("Qué querés repasar").selectOption("resource");
    await page.getByLabel("Buscar por tema").fill("revocado");
    await page.getByRole("button", { name: "Buscar material" }).click();
    const revoked = page.getByRole("button", { name: "Sumar al plan" });
    await revoked.waitFor({ timeout: 15_000 });
    await revoked.click();
    await page.getByRole("alert")
      .filter({ hasText: "Este contenido dejó de estar disponible o accesible." })
      .waitFor({ timeout: 15_000 });
    assert.equal(await page.getByText("2 actividades", { exact: true }).count(), 1);
    assert.deepEqual(searches.slice(0, 3), [
      { kind: "resource", q: "derivadas" },
      { kind: "question", q: "derivadas", status: "closed" },
      { kind: "resource", q: "revocado" },
    ]);
    assert.equal(resourceRechecks, 2, "each resource add must reauthorize the item");
    assert.equal(questionRechecks, 1, "question add must reauthorize the item");
    assert.equal(writes, 0, "finding and adding material must not write to the API");
    assert.deepEqual(pageErrors, []);
    await context.close();
    console.log("PASS B180 Chromium: resource and closed-question search, reauthorization, revoked access, plan/notes preservation and no API writes");
  } finally {
    await browser?.close();
    await stop(child);
  }
}

await main();
