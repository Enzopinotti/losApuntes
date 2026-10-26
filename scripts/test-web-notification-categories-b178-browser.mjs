import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5199";
const API = "http://127.0.0.1:4000";
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
const timestamp = "2026-10-20T10:00:00.000Z";
const notifications = [
  {
    id: "study-answer",
    type: "qa.question_answered",
    actor: { profileId: "profile-1", displayName: "Ana", avatarUrl: null },
    target: { type: "question", id: "question-1" },
    readAt: null,
    createdAt: timestamp,
  },
  {
    id: "study-accepted",
    type: "qa.answer_accepted",
    actor: { profileId: "profile-2", displayName: "Luis", avatarUrl: null },
    target: { type: "answer", id: "answer-1" },
    readAt: timestamp,
    createdAt: timestamp,
  },
  {
    id: "social-followed",
    type: "social.followed",
    actor: { profileId: "profile-3", displayName: "Carla", avatarUrl: null },
    target: { type: "profile", id: "profile-3" },
    readAt: null,
    createdAt: timestamp,
  },
  {
    id: "unknown-future",
    type: "future.event",
    actor: { profileId: "profile-4", displayName: "Mara", avatarUrl: null },
    target: { type: "profile", id: "profile-4" },
    readAt: null,
    createdAt: timestamp,
  },
];
const olderNotifications = [
  {
    id: "social-requested",
    type: "social.connection_requested",
    actor: { profileId: "profile-5", displayName: "Pedro", avatarUrl: null },
    target: { type: "connection", id: "connection-1" },
    readAt: timestamp,
    createdAt: timestamp,
  },
  {
    id: "study-old-answer",
    type: "qa.question_answered",
    actor: { profileId: "profile-6", displayName: "Eva", avatarUrl: null },
    target: { type: "question", id: "question-2" },
    readAt: null,
    createdAt: timestamp,
  },
];

async function boot() {
  const child = spawn(
    process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5199", "--strictPort"],
    {
      cwd: resolve(ROOT, "apps/web"),
      env: { ...process.env, CI: "true", VITE_API_BASE_URL: API },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-2500);
    });
  }
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (exited) throw new Error("Vite exited: " + output);
    try {
      if (
        (
          await fetch(ORIGIN + "/notifications", {
            signal: AbortSignal.timeout(750),
          })
        ).ok
      ) {
        return child;
      }
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
  let markAllCalls = 0;
  const listReads = [];
  let chainMode = null;
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
        "access-control-allow-methods": "GET,PATCH,POST,OPTIONS",
      };
      const reply = (status, payload) =>
        route.fulfill({
          status,
          contentType: "application/json",
          headers,
          body: JSON.stringify(payload),
        });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (path === "/auth/me" && method === "GET") return reply(200, auth);
      if (path === "/auth/google/status" && method === "GET") {
        return reply(200, { webEnabled: false, mobileEnabled: false });
      }
      if (path === "/notifications" && method === "GET") {
        const unreadOnly = url.searchParams.get("unreadOnly") === "true";
        const cursor = url.searchParams.get("cursor");
        listReads.push({ unreadOnly, cursor: cursor ?? null });
        if (chainMode) {
          if (chainMode === "failed" && cursor === "cursor-x") {
            return reply(500, { code: "TEMPORARY" });
          }
          if (chainMode === "failed" && !cursor) {
            return reply(200, { items: [], nextCursor: "cursor-x" });
          }
          const fresh = chainMode === "fresh";
          const name = fresh
            ? cursor === "cursor-a"
              ? "Fresh third"
              : cursor
                ? "Fresh second"
                : "Fresh first"
            : cursor
              ? cursor === "old-b"
                ? "Old third"
                : "Old second"
              : "Old first";
          const item = {
            ...notifications[2],
            id: name,
            actor: { ...notifications[2].actor, displayName: name },
          };
          return reply(200, {
            items: [item],
            nextCursor: fresh
              ? cursor === "cursor-x"
                ? "cursor-a"
                : "cursor-x"
              : cursor
                ? cursor === "old-b"
                  ? "cursor-a"
                  : "old-b"
                : "cursor-a",
          });
        }
        const source = cursor ? olderNotifications : notifications;
        const filtered = unreadOnly
          ? source.filter((item) => item.readAt === null)
          : source;
        return reply(200, {
          items: filtered,
          nextCursor: cursor ? null : unreadOnly ? null : "older-page",
        });
      }
      if (path === "/notifications/read-all" && method === "POST") {
        writes += 1;
        markAllCalls += 1;
        for (const item of [...notifications, ...olderNotifications]) {
          item.readAt = timestamp;
        }
        return reply(200, {
          updated: notifications.length + olderNotifications.length,
        });
      }
      if (path.startsWith("/notifications/") && method === "PATCH") {
        writes += 1;
        return reply(200, { read: true });
      }
      if (method !== "GET") writes += 1;
      return reply(404, { code: "NOT_FOUND" });
    });

    const pageErrors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(ORIGIN + "/notifications", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Notificaciones" }).waitFor({
      timeout: 15_000,
    });
    await page.getByText("Mara registró una actividad").waitFor({
      timeout: 15_000,
    });
    await page
      .getByRole("button", { name: "Preguntas y respuestas (2)" })
      .waitFor({
        timeout: 15_000,
      });
    const initialReads = listReads.length;
    assert.ok(initialReads >= 1, "the inbox must load its first server page");
    assert.equal(
      await page.getByRole("button", { name: "Todas (4)" }).count(),
      1,
    );
    assert.equal(
      await page.getByRole("button", { name: "Actividad social (1)" }).count(),
      1,
    );

    await page
      .getByRole("button", { name: "Preguntas y respuestas (2)" })
      .click();
    await page
      .getByText("Ana respondió tu pregunta")
      .waitFor({ timeout: 15_000 });
    assert.equal(await page.getByText("Carla empezó a seguirte").count(), 0);
    assert.equal(
      await page.getByText("Mara registró una actividad").count(),
      0,
    );
    await page.getByRole("button", { name: "Actividad social (1)" }).click();
    await page
      .getByText("Carla empezó a seguirte")
      .waitFor({ timeout: 15_000 });
    assert.equal(await page.getByText("Ana respondió tu pregunta").count(), 0);
    await delay(200);
    assert.equal(
      listReads.length,
      initialReads,
      "changing category must not fetch or mark items read",
    );

    await page
      .getByRole("button", { name: "Cargar más notificaciones" })
      .click();
    await page.getByText("Pedro te envió una solicitud de conexión").waitFor({
      timeout: 15_000,
    });
    assert.ok(listReads.some((read) => read.cursor === "older-page"));
    await page.getByRole("button", { name: "Actividad social (2)" }).waitFor({
      timeout: 15_000,
    });
    assert.equal(await page.getByText("Eva respondió tu pregunta").count(), 0);

    await page.getByLabel("Solo no leídas").check();
    await page.getByRole("button", { name: "Actividad social (1)" }).waitFor({
      timeout: 15_000,
    });
    assert.ok(
      listReads.some((read) => read.unreadOnly && read.cursor === null),
    );
    assert.equal(await page.getByText("Carla empezó a seguirte").count(), 1);
    assert.equal(
      await page.getByText("Pedro te envió una solicitud de conexión").count(),
      0,
    );

    assert.match(
      await page.locator(".community-notification-scope").first().innerText(),
      /Marcar todas como leídas afecta la bandeja completa/u,
    );
    assert.equal(writes, 0, "local filters must not mutate notification state");
    await page
      .getByRole("button", { name: "Marcar todas como leídas" })
      .click();
    await page.getByText("No hay notificaciones para mostrar.").waitFor({
      timeout: 15_000,
    });
    assert.equal(
      markAllCalls,
      1,
      "the explicit global action must call the existing endpoint once",
    );
    assert.equal(writes, 1);
    assert.equal(
      await page.getByRole("button", { name: "Actividad social (0)" }).count(),
      1,
    );
    chainMode = "old";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Old first empezó a seguirte").waitFor();
    await page
      .getByRole("button", { name: "Cargar más notificaciones" })
      .click();
    await page.getByText("Old second empezó a seguirte").waitFor();
    chainMode = "fresh";
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByText("Fresh second empezó a seguirte").waitFor();
    await page
      .getByRole("button", { name: "Cargar más notificaciones" })
      .click();
    await page
      .getByText("Fresh third empezó a seguirte")
      .waitFor({ timeout: 3000 });
    await page
      .getByText(/El servidor repitió una página de notificaciones/)
      .waitFor();
    assert.equal(await page.locator(".community-list > li").count(), 3);
    assert.equal(
      await page
        .getByRole("button", { name: "Cargar más notificaciones" })
        .count(),
      0,
    );
    chainMode = "old";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Old first empezó a seguirte").waitFor();
    await page
      .getByRole("button", { name: "Cargar más notificaciones" })
      .click();
    await page.getByText("Old second empezó a seguirte").waitFor();
    chainMode = "failed";
    const failedRefresh = page.waitForResponse(
      (response) =>
        response.url().includes("cursor=cursor-x") && response.status() === 500,
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await failedRefresh;
    await page
      .getByRole("button", { name: "Cargar más notificaciones" })
      .click();
    await page.getByText("Old third empezó a seguirte").waitFor();
    await page
      .getByText(/El servidor repitió una página de notificaciones/)
      .waitFor();
    assert.equal(await page.locator(".community-list > li").count(), 3);
    assert.equal(
      await page
        .getByRole("button", { name: "Cargar más notificaciones" })
        .count(),
      0,
    );
    assert.equal(writes, 1);
    assert.deepEqual(pageErrors, []);
    await context.close();
    console.log(
      "PASS B178 Chromium: local categories/counts, unknown-event fallback, pagination, unread server filter and global mark-all semantics",
    );
  } finally {
    await browser?.close();
    await stop(child);
  }
}

await main();
