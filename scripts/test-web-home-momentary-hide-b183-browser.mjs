import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5193";
const API = "http://127.0.0.1:4000";
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
const AUTH = {
  user: { id: "6f421f06-1cc0-49c1-96c7-3325c5a3edc7", email: "b183@example.invalid" },
  session: {
    id: "b3f1c920-f2c4-41ac-984b-1c0da61c92b7",
    clientType: "web",
    createdAt: "2026-01-01T10:00:00Z",
    lastSeenAt: "2026-01-01T10:00:00Z",
    expiresAt: "2027-01-01T10:00:00Z",
    current: true,
  },
};
const id = (i) => "67fe8f36-2c8d-4c85-897d-46702ebf127" + i;
const items = [1, 2, 3].map((n) => ({
  type: n === 1 ? "question" : n === 2 ? "resource" : "organization_post",
  id: id(n),
  title: "Contenido de prueba " + n,
  summary: "Detalle académico breve " + n,
  author: { profileId: null, displayName: "Persona de prueba", avatarUrl: null },
  source: { kind: "personal_user" },
  academic: { subject: { id: "104b311b-852c-497d-982c-4d8146a9874a", name: "Álgebra" } },
  why: ["current_subject"],
  createdAt: "2026-01-01T12:00:00Z",
}));
const snapshot = {
  profileReady: true,
  lifecycle: {
    phase: "student",
    activeStudentAffiliationIds: [],
    alumniAffiliationIds: [],
    currentSubjectIds: [items[0].academic.subject.id],
    hasCurrentSubjectContext: true,
    currentAffiliationId: null,
    follows: [],
    followsTruncated: false,
    followsLimit: 25,
  },
  academic: { currentContext: null, currentSubjectIds: [items[0].academic.subject.id] },
  homeFeed: { kind: "subjects", items, nextCursor: null, stopReason: "end" },
  academicFeed: { context: { subjectIds: [items[0].academic.subject.id] },
    items: [], nextCursor: null, stopReason: "end" },
  forYou: { items: [items[2], items[0]], nextCursor: null, stopReason: "end",
    effectiveSignals: { academic: true, social: false, interests: false,
      relationWindowTruncated: false } },
  notifications: { unreadCount: 0 },
};

async function boot() {
  const child = spawn(process.execPath, [VITE, "--host", "127.0.0.1",
    "--port", "5193", "--strictPort"], {
    cwd: resolve(ROOT, "apps/web"),
    env: { ...process.env, CI: "true", VITE_API_BASE_URL: API },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let exited = false;
  child.on("exit", () => { exited = true; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => { output = (output + chunk.toString()).slice(-4000); });
  }
  for (let i = 0; i < 120; i++) {
    if (exited) throw new Error("Vite exited: " + output);
    try {
      if ((await fetch(ORIGIN, { signal: AbortSignal.timeout(800) })).ok) return child;
    } catch {
      // Loopback only.
    }
    await delay(250);
  }
  child.kill("SIGTERM");
  throw new Error("Vite readiness timeout: " + output);
}
async function shutdown(child) {
  if (!child || child.exitCode !== null) return;
  const ended = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([ended, delay(2500)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  let child, browser;
  try {
    child = await boot();
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    let authorized = false;
    let mutationCount = 0;
    await ctx.route(API + "/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() !== "GET") mutationCount++;
      let code = 404;
      let body = { code: "NOT_FOUND" };
      if (path === "/auth/me") {
        code = authorized ? 200 : 401;
        body = authorized ? AUTH : { code: "AUTHENTICATION_REQUIRED" };
      } else if (path === "/pilot/home" && authorized) {
        code = 200;
        body = snapshot;
      }
      await route.fulfill({
        status: code,
        contentType: "application/json",
        headers: { "access-control-allow-origin": ORIGIN,
          "access-control-allow-credentials": "true" },
        body: JSON.stringify(body),
      });
    });

    const page = await ctx.newPage();
    await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
    await page.getByText("Tu universidad, organizada", { exact: false })
      .waitFor({ timeout: 15000 });
    assert.equal(await page.getByRole("button", { name: /Apartar de esta tanda:/u }).count(), 0);

    authorized = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    const card = page.locator(".pilot-home-feed");
    await card.getByRole("heading", { name: "Contenido de prueba 1" })
      .waitFor({ timeout: 15000 });
    assert.equal(await card.getByRole("button", { name: /Apartar de esta tanda:/u }).count(), 3);

    await card.getByRole("button", { name: "Apartar de esta tanda: Contenido de prueba 2" })
      .click();
    assert.equal(await card.getByRole("heading", { name: "Contenido de prueba 2" }).count(), 0);
    await card.getByRole("button", { name: "Deshacer último" }).click();
    await card.getByRole("heading", { name: "Contenido de prueba 2" }).waitFor();

    for (const n of [1, 2, 3]) {
      await card.getByRole("button", { name: "Apartar de esta tanda: Contenido de prueba " + n }).click();
    }
    await card.getByText("Apartaste todos los elementos", { exact: false }).waitFor();
    assert.equal(await card.getByRole("heading", { name: /Contenido de prueba/u }).count(), 0);
    await card.getByRole("button", { name: "Mostrar todo" }).click();
    assert.equal(await card.getByRole("heading", { name: /Contenido de prueba/u }).count(), 3);

    await card.getByRole("button", { name: "Apartar de esta tanda: Contenido de prueba 1" }).click();
    await card.getByRole("button", { name: "Para vos" }).click();
    await card.getByRole("heading", { name: "Contenido de prueba 1" }).waitFor();
    await card.getByRole("button", { name: "Mis materias" }).click();
    await card.getByRole("heading", { name: "Contenido de prueba 1" }).waitFor();

    authorized = false;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Tu universidad, organizada", { exact: false }).waitFor();
    assert.equal(await card.getByRole("button", { name: /Apartar de esta tanda:/u }).count(), 0);
    assert.equal(mutationCount, 0);
    await ctx.close();
    console.log("PASS B183 Chromium: guest isolation, private preview hide, undo, restore all, feed reset, auth loss, zero writes");
  } finally {
    await browser?.close();
    await shutdown(child);
  }
}
await main();
