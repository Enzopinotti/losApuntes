import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(".");
const webOrigin = "http://127.0.0.1:5186";
const apiOrigin = "http://127.0.0.1:4186";
const subjectId = "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e80";
const resourceId = "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e81";
const questionId = "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e82";
const studentId = "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e83";
const sessionId = "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e84";
const now = "2026-10-21T12:00:00.000Z";
const resource = {
  id: resourceId,
  title: "Resumen de integrales",
  description: "Guía para estudiar cálculo",
  tags: ["cálculo"],
  visibility: "public",
  author: null,
  academic: {
    subject: { id: subjectId, name: "Análisis Matemático" },
    courseOffering: null,
  },
  file: {
    id: "a1af6e19-7bc8-44b0-b3f5-7fb7746b1e85",
    filename: "integrales.pdf",
    mimeType: "application/pdf",
    byteSize: 10240,
  },
  capabilities: { edit: false, manageShares: false },
  revision: 1,
  createdAt: now,
  updatedAt: now,
};
const question = {
  id: questionId,
  title: "¿Cómo resolver integrales por partes?",
  body: "¿Qué método es mejor para estos ejercicios?",
  state: "open",
  author: null,
  academic: resource.academic,
  answerCount: 0,
  acceptedAnswerId: null,
  revision: 1,
  viewer: {
    canEdit: false,
    canAnswer: true,
    canAcceptAnswers: false,
    canReport: false,
  },
  createdAt: now,
  updatedAt: now,
};

async function startVite() {
  const child = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5186", "--strictPort"],
    {
      cwd: resolve(root, "apps/web"),
      env: { ...process.env, VITE_API_BASE_URL: apiOrigin },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (bytes) => { logs = (logs + bytes.toString()).slice(-4000); });
  child.stderr.on("data", (bytes) => { logs = (logs + bytes.toString()).slice(-4000); });
  let exited = false;
  child.once("exit", () => { exited = true; });
  try {
    for (let attempt = 0; attempt < 90; attempt++) {
      if (exited) throw new Error("Vite exited: " + logs);
      try {
        const res = await fetch(webOrigin + "/login", {
          signal: AbortSignal.timeout(700),
        });
        if (res.ok) return { child, logs: () => logs, exited: () => exited };
      } catch {
        // Vite is still starting.
      }
      await delay(200);
    }
    throw new Error("Vite did not start: " + logs);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
}

async function stopVite(server) {
  if (server.exited()) return;
  const stopped = new Promise((done) => server.child.once("exit", done));
  server.child.kill("SIGTERM");
  await Promise.race([stopped, delay(2500)]);
  if (!server.exited()) {
    server.child.kill("SIGKILL");
    await Promise.race([stopped, delay(1000)]);
  }
}

async function run() {
  const server = await startVite();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const pageErrors = [];
    const unsafeRequests = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const events = {
      saves: 0,
      resourceReads: 0,
      questionsSearched: 0,
      deniedHandoff: false,
      rejectNextResourceRead: false,
    };
    await page.route(apiOrigin + "/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname;
      const method = req.method();
      const cors = {
        "access-control-allow-origin": webOrigin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, accept, x-csrf-token",
        "content-type": "application/json",
      };
      const json = async (body, status = 200) =>
        route.fulfill({ status, headers: cors, body: JSON.stringify(body) });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (method === "GET" && path === "/auth/me") {
        return json({
          user: { id: studentId, email: "browser-student@example.test" },
          session: {
            id: sessionId,
            clientType: "web",
            createdAt: now,
            lastSeenAt: now,
            expiresAt: "2026-12-21T12:00:00.000Z",
            current: true,
          },
        });
      }
      if (method === "GET" && path === "/discovery/contextual") {
        return json({ subjects: [{ subject: resource.academic.subject, resources: [resource] }] });
      }
      if (method === "GET" && path === "/search") {
        return json({
          query: url.searchParams.get("q") || "integrales",
          scope: url.searchParams.get("scope") || "resources",
          results: { resources: [resource], subjects: [], people: [] },
        });
      }
      if (method === "PUT" && path === `/resources/${resourceId}/save`) {
        events.saves++;
        return json({ saved: true });
      }
      if (method === "GET" && path === `/resources/${resourceId}`) {
        events.resourceReads++;
        if (events.rejectNextResourceRead) {
          events.rejectNextResourceRead = false;
          events.deniedHandoff = true;
          return json({ code: "FORBIDDEN", message: "Acceso revocado" }, 403);
        }
        return json({ resource });
      }
      if (method === "GET" && path === "/resources/saved/search") {
        return json({ items: [], nextCursor: null });
      }
      if (method === "GET" && (path === "/resources" || path === "/resources/saved")) {
        return json({
          items: url.searchParams.has("q") ? [resource] : [],
          nextCursor: null,
        });
      }
      if (method === "GET" && path === "/questions") {
        if (url.searchParams.has("q")) events.questionsSearched++;
        return json({
          items: url.searchParams.has("q") ? [question] : [],
          nextCursor: null,
        });
      }
      if (method === "GET" && path === `/questions/${questionId}`) {
        return json({
          question, answers: [], answersNextCursor: null, answersLimit: 25,
        });
      }
      if (method === "GET" && path === "/academic/catalog/search") {
        return json({ items: [] });
      }
      unsafeRequests.push(method + " " + path);
      return json({ code: "NOT_FOUND", message: "Fixture API path not configured" }, 404);
    });

    // Real React UI, with a deterministic test-only API adapter; no real
    // student records, credentials, external URLs or permission grants.
    await page.goto(webOrigin + "/search?q=integrales&scope=resources");
    const save = page.getByRole("button", {
      name: "Guardar apunte: Resumen de integrales",
    });
    await save.waitFor();
    await save.click();
    await page.getByRole("button", {
      name: "Apunte guardado: Resumen de integrales",
    }).waitFor();
    assert.equal(events.saves, 1, "A confirmed save must execute once");
    await page.getByRole("link", { name: "Ver recurso" }).click();
    await page.waitForURL("**/resources/" + resourceId);
    const prepare = page.getByRole("button", {
      name: "Preparar sesión con este apunte",
    });
    await prepare.waitFor();
    events.rejectNextResourceRead = true;
    await prepare.click();
    await page.getByRole("alert").getByText(
      "Este apunte o tu materia dejaron de estar disponibles.",
    ).waitFor();
    assert.equal(events.deniedHandoff, true);
    assert.equal(new URL(page.url()).pathname, "/resources/" + resourceId);

    await prepare.click();
    await page.waitForURL((url) => url.pathname === "/study/session");
    assert.equal(new URL(page.url()).searchParams.get("subjectId"), subjectId);
    await page.getByRole("button", {
      name: "Sumar actividades sin perder mi plan",
    }).click();
    await page.getByText("Se incorporaron 1 actividades verificadas.").waitFor();
    await page.locator(".study-session-summary strong").getByText("1 actividades").waitFor();

    const finder = page.getByRole("region", {
      name: "Encontrar material para tu plan",
    });
    await finder.getByLabel("Qué querés repasar").selectOption("question");
    await finder.getByLabel("Buscar por tema").fill("integrales");
    await finder.getByRole("button", { name: "Buscar material" }).click();
    await finder.getByRole("button", { name: "Sumar al plan" }).click();
    await page.locator(".study-session-summary strong").getByText("2 actividades").waitFor();
    await page.getByText("45 minutos previstos").waitFor();
    assert.ok(events.questionsSearched >= 1);
    assert.equal(await finder.getByRole("button", { name: "Agregado" }).count(), 1);

    await page.getByRole("link", { name: "Mis colecciones portátiles" }).click();
    await page.waitForURL((url) => url.pathname === "/study/kits");
    const kitForm = page.locator(".study-kits-form").first();
    await kitForm.getByLabel("Nombre").fill("Parcial de integrales");
    await kitForm.getByRole("button", { name: "Crear colección" }).click();
    const kitFinder = page.getByRole("region", {
      name: "Encontrar un apunte específico",
    });
    await kitFinder.getByLabel("Título, descripción o etiqueta").fill("integrales");
    await kitFinder.getByRole("button", { name: "Buscar apuntes" }).click();
    await kitFinder.getByRole("button", {
      name: "Agregar apunte Resumen de integrales al kit",
    }).click();
    await page.getByText("1/").first().waitFor();

    assert.deepEqual(pageErrors, [], "The combined UI cannot throw browser errors");
    assert.deepEqual(unsafeRequests, [], "Unexpected API calls indicate a missing fixture or new authority");
    console.log(JSON.stringify({
      event: "b183.browser_student_journey",
      status: "PASS",
      studentFlow: "search-save-resource-reauthorize-plan-qa-kit",
      simulatedApi: true,
      realBrowser: "Chromium",
      savesConfirmed: events.saves,
      staleAccessRejected: events.deniedHandoff,
      releaseAuthorized: false,
      backendE2EAccepted: false,
    }));
  } finally {
    if (browser) await browser.close();
    await stopVite(server);
  }
}

await run();
