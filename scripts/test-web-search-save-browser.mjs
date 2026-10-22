import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = "http://127.0.0.1:5188";
const API_ORIGIN = "http://127.0.0.1:4001";
const ROOT = process.cwd();
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
const RESOURCE_IDS = [
  "0d9a5f26-f659-40da-b9c8-632f18fb90c1",
  "2ea74170-df25-4cee-a221-0e9e422f8e06",
  "9bd99bcb-f6c8-48c1-bfd0-dda465d52b19",
];
const SUBJECT_ID = "8e27a0df-44c1-4c2d-87d8-c56ec0884ce2";
const AUTH_SNAPSHOT = {
  user: {
    id: "6f421f06-1cc0-49c1-96c7-3325c5a3edc7",
    email: "search-save@example.invalid",
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

function corsHeaders() {
  return {
    "access-control-allow-origin": ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "accept, content-type",
  };
}

async function fulfill(route, status, value) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders(),
    body: value === null ? "" : JSON.stringify(value),
  });
}

function resource(id, title) {
  return {
    id,
    title,
    description: null,
    tags: [],
    visibility: "public",
    author: {
      profileId: "2e016c59-2e5b-4937-b67c-c8eb34e69f37",
      displayName: "Autora de prueba",
      avatarUrl: null,
    },
    academic: {
      subject: { id: SUBJECT_ID, name: "Bases de Datos" },
      courseOffering: null,
    },
    file: {
      id: "970db3c8-0925-49f2-8f4f-8d0c1c50c50b",
      filename: "apunte.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
    },
    capabilities: { edit: false, manageShares: false },
    revision: 1,
    createdAt: "2026-01-01T10:00:00Z",
    updatedAt: "2026-01-01T10:00:00Z",
  };
}

async function bootWeb() {
  const child = spawn(
    process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5188", "--strictPort"],
    {
      cwd: resolve(ROOT, "apps/web"),
      env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN, CI: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let spawnError = null;
  let exited = false;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-3500);
    });
  }
  child.on("error", (error) => {
    spawnError = error;
  });
  child.on("exit", () => {
    exited = true;
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (exited) throw new Error("Vite failed to start: " + output);
    try {
      const response = await fetch(ORIGIN + "/search", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return child;
    } catch {
      // Vite is not listening yet.
    }
    await delay(250);
  }
  child.kill("SIGTERM");
  throw new Error("Vite startup timeout: " + output);
}

async function stopWeb(child) {
  if (!child || child.exitCode !== null) return;
  let completed = false;
  const exited = new Promise((resolveExit) =>
    child.once("exit", () => {
      completed = true;
      resolveExit();
    }),
  );
  child.kill("SIGTERM");
  await Promise.race([exited, delay(2500)]);
  if (!completed) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(1000)]);
  }
}

async function createPage(browser, { authenticated, saveReplies, saveCounts }) {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const unexpectedCalls = [];

  await context.route(API_ORIGIN + "/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }

    if (path === "/auth/me" && request.method() === "GET") {
      if (authenticated) {
        await fulfill(route, 200, AUTH_SNAPSHOT);
      } else {
        await fulfill(route, 401, {
          code: "AUTHENTICATION_REQUIRED",
          message: "Not authenticated",
        });
      }
      return;
    }

    if (path === "/discovery/contextual" && request.method() === "GET") {
      await fulfill(route, 200, { subjects: [] });
      return;
    }

    if (path === "/search" && request.method() === "GET") {
      await fulfill(route, 200, {
        query: url.searchParams.get("q"),
        scope: "resources",
        results: {
          resources: [
            resource(RESOURCE_IDS[0], "Álgebra relacional"),
            resource(RESOURCE_IDS[1], "Índices de prueba"),
            resource(RESOURCE_IDS[2], "Transacciones de prueba"),
          ],
          subjects: [],
          people: [],
        },
      });
      return;
    }

    const saveMatch = path.match(/^\/resources\/([0-9a-f-]+)\/save$/iu);
    if (saveMatch && request.method() === "PUT") {
      const id = saveMatch[1];
      saveCounts.set(id, (saveCounts.get(id) ?? 0) + 1);
      const reply = saveReplies.get(id);
      if (!reply) {
        unexpectedCalls.push(request.method() + " " + path);
        await fulfill(route, 500, { code: "UNEXPECTED_TEST_REQUEST" });
        return;
      }
      if (reply.delayMs) await delay(reply.delayMs);
      await fulfill(route, reply.status, reply.body);
      return;
    }

    unexpectedCalls.push(request.method() + " " + path);
    await fulfill(route, 404, { code: "UNEXPECTED_TEST_REQUEST" });
  });

  return { context, page: await context.newPage(), unexpectedCalls };
}

async function openSearch(page) {
  await page.goto(ORIGIN + "/search?q=bases%20de%20datos&scope=resources", {
    waitUntil: "domcontentloaded",
  });
  await page.getByText("Álgebra relacional", { exact: true }).waitFor({
    timeout: 12_000,
  });
}

async function main() {
  let server;
  let browser;
  try {
    server = await bootWeb();
    browser = await chromium.launch({ headless: true });

    const guest = await createPage(browser, {
      authenticated: false,
      saveReplies: new Map(),
      saveCounts: new Map(),
    });
    await openSearch(guest.page);
    assert.equal(
      await guest.page.getByRole("link", { name: "Iniciá sesión" }).count(),
      1,
    );
    assert.equal(
      await guest.page.getByRole("button", { name: /Guardar apunte/u }).count(),
      0,
      "Guests must not receive a save mutation control",
    );
    assert.deepEqual(guest.unexpectedCalls, []);
    await guest.context.close();

    const saveReplies = new Map([
      [RESOURCE_IDS[0], { status: 200, body: { saved: true }, delayMs: 250 }],
      [RESOURCE_IDS[1], { status: 200, body: { saved: false }, delayMs: 250 }],
      [
        RESOURCE_IDS[2],
        {
          status: 403,
          body: { code: "RESOURCE_ACCESS_FORBIDDEN", message: "Forbidden" },
          delayMs: 150,
        },
      ],
    ]);
    const saveCounts = new Map();
    const member = await createPage(browser, {
      authenticated: true,
      saveReplies,
      saveCounts,
    });
    await openSearch(member.page);

    const successButton = member.page.getByRole("button", {
      name: "Guardar apunte: Álgebra relacional",
    });
    await successButton.dblclick();
    await member.page
      .getByRole("button", { name: "Apunte guardado: Álgebra relacional" })
      .waitFor({ timeout: 12_000 });
    await member.page
      .locator(".search-save-action [role='status']")
      .filter({ hasText: "Guardado en tu biblioteca." })
      .waitFor({ timeout: 5_000 });
    assert.equal(
      await member.page
        .getByRole("button", { name: "Apunte guardado: Álgebra relacional" })
        .isDisabled(),
      true,
    );
    assert.equal(
      saveCounts.get(RESOURCE_IDS[0]),
      1,
      "A double-click sent one PUT",
    );

    await member.page
      .getByRole("button", { name: "Guardar apunte: Índices de prueba" })
      .dblclick();
    await member.page
      .locator(".search-save-action [role='alert']")
      .filter({ hasText: "No pudimos confirmar si quedó guardado" })
      .waitFor({ timeout: 12_000 });
    await delay(300);
    assert.equal(
      saveCounts.get(RESOURCE_IDS[1]),
      1,
      "Unknown outcomes are not retried",
    );
    assert.equal(
      await member.page
        .getByRole("button", { name: "Guardar apunte: Índices de prueba" })
        .isDisabled(),
      false,
      "The user may retry manually after checking Guardados",
    );

    await member.page
      .getByRole("button", { name: "Guardar apunte: Transacciones de prueba" })
      .click();
    await member.page
      .locator(".search-save-action [role='alert']")
      .filter({ hasText: "Ya no podés guardar este apunte" })
      .waitFor({ timeout: 12_000 });
    assert.equal(saveCounts.get(RESOURCE_IDS[2]), 1);
    assert.deepEqual(member.unexpectedCalls, []);
    assert.deepEqual([...saveCounts.keys()].sort(), [...RESOURCE_IDS].sort());
    await member.context.close();

    console.log(
      "PASS B175 Chromium: guest gating, authenticated save, duplicate-click fencing, ambiguous outcome and authorization failure",
    );
  } finally {
    if (browser) await browser.close();
    await stopWeb(server);
  }
}

await main();
