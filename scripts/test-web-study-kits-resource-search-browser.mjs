import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5198";
const API = "http://127.0.0.1:4000";
const SUBJECT_ID = "c59a6dc1-557a-4ea3-9c23-e3a1ea9e76db";
const RESOURCE_ID = "fd3a1d96-c53f-4a44-9e91-1ddc9f63a098";
const SECOND_RESOURCE_ID = "2d9ce92e-16b3-4bc1-94e0-68558416c36a";
const FOREIGN_RESOURCE_ID = "719683d9-1e89-4d8c-8d01-431e538e8b65";
const REVOKED_RESOURCE_ID = "0e8d71ec-8c4f-4e83-a3b0-6f14529b85a0";
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
const subject = { id: SUBJECT_ID, name: "Matemática" };
const resources = [
  {
    id: RESOURCE_ID,
    title: "Integrales definidas",
    academic: { subject, courseOffering: null },
  },
  {
    id: SECOND_RESOURCE_ID,
    title: "Integrales impropias",
    academic: { subject, courseOffering: null },
  },
  {
    id: FOREIGN_RESOURCE_ID,
    title: "Apunte de otra materia",
    academic: {
      subject: { id: "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e81", name: "Física" },
      courseOffering: null,
    },
  },
  {
    id: REVOKED_RESOURCE_ID,
    title: "Integrales revocadas",
    academic: { subject, courseOffering: null },
  },
];

async function boot() {
  const child = spawn(
    process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5198", "--strictPort"],
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
          await fetch(ORIGIN + "/study/kits?subjectId=" + SUBJECT_ID, {
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
  const authorizedReads = [];
  const searches = [];
  let sourceStatus = 200;
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
      const reply = (status, payload) =>
        route.fulfill({
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
          subjects: [{ subject, resources: [] }],
        });
      }
      if (path === "/resources/saved/search") {
        return reply(200, { items: [], nextCursor: null });
      }
      if (path === "/resources") {
        const q = url.searchParams.get("q") ?? "";
        if (!q) {
          if (sourceStatus !== 200) {
            return reply(sourceStatus, {
              code: "SOURCE_UNAVAILABLE",
              message: `Source failure ${sourceStatus}`,
            });
          }
          return reply(200, {
            items: [resources[1]],
            nextCursor: "source-page",
          });
        }
        const cursor = url.searchParams.get("cursor");
        searches.push({ q, cursor });
        if (q === "integrales") {
          return reply(200, {
            items: cursor
              ? [resources[1], resources[0]]
              : [resources[0], resources[2]],
            nextCursor: cursor ? null : "page-two",
          });
        }
        if (q === "revocadas") {
          return reply(200, { items: [resources[3]], nextCursor: null });
        }
        return reply(200, { items: [], nextCursor: null });
      }
      const resourceId = path.split("/").at(-1);
      if (path.startsWith("/resources/") && resourceId) {
        authorizedReads.push(resourceId);
        const item = resources.find((resource) => resource.id === resourceId);
        if (!item) return reply(404, { code: "RESOURCE_NOT_FOUND" });
        if (resourceId === REVOKED_RESOURCE_ID) {
          return reply(403, { code: "RESOURCE_FORBIDDEN" });
        }
        return reply(200, {
          resource: {
            ...item,
            description: "Material autorizado de prueba.",
            tags: ["integrales"],
            visibility: "public",
            author: {
              profileId: "8f32263e-46b5-4a45-b6d9-e5a56806f85d",
              displayName: "Ana",
              avatarUrl: null,
            },
            file: {
              id: "31dec561-0d91-4be1-9714-8cfd05d181b9",
              filename: "integrales.pdf",
              mimeType: "application/pdf",
              byteSize: 1000,
            },
            capabilities: { edit: false, manageShares: false },
            revision: 1,
            createdAt: "2026-01-01T10:00:00Z",
            updatedAt: "2026-01-01T10:00:00Z",
          },
        });
      }
      return reply(404, { code: "NOT_FOUND" });
    });

    const pageErrors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(ORIGIN + "/study/kits?subjectId=" + SUBJECT_ID, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Nueva colección" }).waitFor({
      timeout: 15_000,
    });
    await page.getByLabel("Nombre", { exact: true }).fill("Kit de integrales");
    await page
      .getByLabel("Notas personales", { exact: true })
      .fill("Repasar sin perder el orden.");
    await page.getByRole("button", { name: "Crear colección" }).click();
    await page.getByRole("heading", { name: "Kit de integrales" }).waitFor({
      timeout: 15_000,
    });

    const searchInput = page.getByLabel("Título, descripción o etiqueta");
    await searchInput.fill("integrales");
    await delay(350);
    assert.equal(searches.length, 0, "typing must not send a request per key");
    await page.getByRole("button", { name: "Buscar apuntes" }).click();
    const finder = page.locator(".study-kits-lookup");
    await finder.getByRole("link", { name: "Integrales definidas" }).waitFor({
      timeout: 15_000,
    });
    assert.equal(await finder.getByText("Apunte de otra materia").count(), 0);
    assert.deepEqual(searches, [{ q: "integrales", cursor: null }]);
    await finder
      .getByRole("button", { name: "Más resultados de búsqueda" })
      .click();
    await finder.getByRole("link", { name: "Integrales impropias" }).waitFor({
      timeout: 15_000,
    });
    assert.equal(
      await finder.getByRole("link", { name: "Integrales definidas" }).count(),
      1,
      "cursor pages must deduplicate repeated resources",
    );
    assert.deepEqual(searches, [
      { q: "integrales", cursor: null },
      { q: "integrales", cursor: "page-two" },
    ]);

    const addResource = finder
      .locator("li")
      .filter({ hasText: "Integrales definidas" })
      .getByRole("button", {
        name: "Agregar apunte Integrales definidas al kit",
      });
    await addResource.click();
    await page
      .locator(".study-kits-items")
      .getByRole("link", { name: "Integrales definidas" })
      .waitFor({ timeout: 15_000 });
    assert.equal(
      await addResource.isDisabled(),
      true,
      "a kit must not add the same ID twice",
    );
    assert.equal(await page.getByText(/1\s*\/\s*24 apuntes/u).count(), 1);
    assert.deepEqual(authorizedReads, [RESOURCE_ID]);

    await searchInput.fill("revocadas");
    await page.getByRole("button", { name: "Buscar apuntes" }).click();
    await finder.getByRole("link", { name: "Integrales revocadas" }).waitFor({
      timeout: 15_000,
    });
    await finder
      .getByRole("button", {
        name: "Agregar apunte Integrales revocadas al kit",
      })
      .click();
    const kitItems = page.locator(".study-kits-items");
    await kitItems
      .getByRole("link", { name: "Integrales definidas" })
      .waitFor({ timeout: 15_000 });
    await kitItems
      .getByText("Referencia sin acceso confirmado", { exact: true })
      .waitFor({ timeout: 15_000 });
    assert.equal(
      authorizedReads.filter((id) => id === REVOKED_RESOURCE_ID).length,
      1,
      "the newly selected reference must be rechecked",
    );
    assert.equal(
      authorizedReads.length,
      3,
      "selected kit references are rechecked together",
    );
    assert.equal(
      await kitItems
        .getByRole("link", { name: "Integrales revocadas" })
        .count(),
      0,
      "a revoked title must not be shown as an authorized kit item",
    );
    assert.equal(
      writes,
      0,
      "searching and adding to a portable kit must not write to the API",
    );
    const discovery = page.locator(".study-kits-discovery");
    const discoveredResource = discovery.getByRole("link", {
      name: "Integrales impropias",
      exact: true,
    });
    await discoveredResource.waitFor();
    await page
      .getByRole("button", { name: "Más apuntes", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Actualizar encontrados" })
      .waitFor();
    assert.equal(await discoveredResource.count(), 1);

    sourceStatus = 500;
    await page.getByRole("button", { name: "Actualizar encontrados" }).click();
    await page.getByText("Source failure 500", { exact: true }).waitFor();
    assert.equal(await discoveredResource.count(), 1);
    assert.equal(
      await page
        .getByRole("button", { name: "Actualizar encontrados" })
        .count(),
      1,
      "a transient refresh failure must retain the source and its recovery action",
    );

    for (const status of [401, 403, 404]) {
      sourceStatus = 200;
      await page.getByRole("button", { name: "Actualizar fuentes" }).click();
      await discoveredResource.waitFor();
      sourceStatus = status;
      await page.getByRole("button", { name: "Actualizar fuentes" }).click();
      await page
        .getByText(
          status === 401
            ? "La sesión venció. Iniciá sesión nuevamente."
            : "El apunte dejó de estar disponible.",
          { exact: true },
        )
        .waitFor();
      await discoveredResource.waitFor({ state: "hidden", timeout: 3000 });
    }
    assert.deepEqual(pageErrors, []);
    await context.close();
    console.log(
      "PASS Chromium: Study Kit search, source cursor recovery, transient retention, 401/403/404 source clearing, access recheck, and no API writes",
    );
  } finally {
    await browser?.close();
    await stop(child);
  }
}

await main();
