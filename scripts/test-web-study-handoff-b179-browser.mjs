import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5196";
const API = "http://127.0.0.1:4000";
const RESOURCE_ID = "fd3a1d96-c53f-4a44-9e91-1ddc9f63a098";
const SUBJECT_ID = "c59a6dc1-557a-4ea3-9c23-e3a1ea9e76db";
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
const resource = {
  id: RESOURCE_ID,
  title: "Anatomía celular",
  description: "Material para preparar el parcial.",
  tags: ["célula"],
  visibility: "public",
  author: { profileId: "8f32263e-46b5-4a45-b6d9-e5a56806f85d", displayName: "Ana", avatarUrl: null },
  academic: {
    subject: { id: SUBJECT_ID, name: "Biología" },
    courseOffering: null,
  },
  file: {
    id: "31dec561-0d91-4be1-9714-8cfd05d181b9",
    filename: "anatomia.pdf",
    mimeType: "application/pdf",
    byteSize: 1000,
  },
  capabilities: { edit: false, manageShares: false },
  revision: 1,
  createdAt: "2026-01-01T10:00:00Z",
  updatedAt: "2026-01-01T10:00:00Z",
};

async function boot() {
  const child = spawn(
    process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5196", "--strictPort"],
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
      if ((await fetch(ORIGIN + "/resources/" + RESOURCE_ID, {
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
  let allowSubject = true;
  let writes = 0;
  let resourceReads = 0;
  let contextualReads = 0;
  try {
    child = await boot();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ reducedMotion: "reduce" });
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
        return reply(404, { code: "NOT_FOUND" });
      }
      if (path === "/auth/me") return reply(200, auth);
      if (path === "/auth/google/status") {
        return reply(200, { webEnabled: false, mobileEnabled: false });
      }
      if (path === "/resources/" + RESOURCE_ID) {
        resourceReads += 1;
        return reply(200, { resource });
      }
      if (path === "/discovery/contextual") {
        contextualReads += 1;
        return reply(200, {
          subjects: allowSubject
            ? [{ subject: { id: SUBJECT_ID, name: "Biología" }, resources: [] }]
            : [],
        });
      }
      if (path === "/resources/saved/search" || path === "/resources") {
        return reply(200, { items: [], nextCursor: null });
      }
      if (path === "/questions") {
        return reply(200, { items: [], nextCursor: null });
      }
      return reply(404, { code: "NOT_FOUND" });
    });

    const pageErrors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(ORIGIN + "/resources/" + RESOURCE_ID, {
      waitUntil: "domcontentloaded",
    });
    const prepare = page.getByRole("button", {
      name: "Preparar sesión con este apunte",
    });
    await prepare.waitFor({ timeout: 15_000 });
    await prepare.click();
    await page.getByRole("heading", {
      name: "Continuar desde otra herramienta de estudio",
    }).waitFor({ timeout: 15_000 });

    assert.equal(await page.getByText(/Hay 1 actividades de repaso/u).count(), 1);
    assert.equal(
      await page.getByRole("button", { name: "Sumar actividades sin perder mi plan" }).count(),
      1,
    );
    assert.equal(
      await page.getByRole("button", { name: "Reemplazar por el repaso" }).count(),
      1,
    );
    assert.ok(page.url().includes("subjectId=" + SUBJECT_ID));
    assert.ok(!page.url().includes(RESOURCE_ID), "resource ID must stay out of URL");
    const routeState = await page.evaluate(() => window.history.state?.usr);
    assert.deepEqual(Object.keys(routeState).sort(), ["kind", "token", "version"]);
    assert.equal(writes, 0, "preparing a session must not write to any API");

    // A public resource ID alone cannot create a plan for a non-current subject.
    allowSubject = false;
    const rejected = await context.newPage();
    rejected.on("pageerror", (error) => pageErrors.push(error.message));
    await rejected.goto(ORIGIN + "/resources/" + RESOURCE_ID, {
      waitUntil: "domcontentloaded",
    });
    const deniedPrepare = rejected.getByRole("button", {
      name: "Preparar sesión con este apunte",
    });
    await deniedPrepare.waitFor({ timeout: 15_000 });
    await deniedPrepare.click();
    await rejected.getByRole("alert", {
      name: "",
    }).filter({ hasText: "no pertenece a una de tus primeras ocho materias actuales" })
      .waitFor({ timeout: 15_000 });
    assert.ok(rejected.url().includes("/resources/" + RESOURCE_ID));
    assert.equal(writes, 0);
    assert.ok(resourceReads >= 4, "both journeys must refetch the resource");
    assert.ok(contextualReads >= 3, "the handoff and planner must verify current context");
    assert.deepEqual(pageErrors, []);
    await context.close();
    console.log("PASS B179 Chromium: current-subject handoff, opaque route state, explicit append/replace, no API writes and non-current subject rejection");
  } finally {
    await browser?.close();
    await stop(child);
  }
}

await main();
