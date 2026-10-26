import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5190";
const API = "http://127.0.0.1:4000";
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
const SUBJECT_A = "104b311b-852c-497d-982c-4d8146a9874a";
const SUBJECT_B = "8e4a8f43-4e3c-4af3-88df-37e8a5ac7937";
const QUESTION_OPEN = "0d5447a9-cc76-4eca-af9d-ad927ab7aa91";
const QUESTION_CLOSED = "e58c2f30-a27e-45e9-9c99-82badd5f95a1";
const QUESTION_SECOND = "48f3060c-eebd-4616-8c47-77f4d65f444c";
const SESSION = {
  user: {
    id: "6f421f06-1cc0-49c1-96c7-3325c5a3edc7",
    email: "b176@example.invalid",
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

async function boot() {
  const child = spawn(
    process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5190", "--strictPort"],
    {
      cwd: resolve(ROOT, "apps/web"),
      env: { ...process.env, VITE_API_BASE_URL: API },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let exited = false;
  let startError = null;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-3000);
    });
  }
  child.on("exit", () => {
    exited = true;
  });
  child.on("error", (error) => {
    startError = error;
  });
  const expires = Date.now() + 30000;
  while (Date.now() < expires) {
    if (startError) throw startError;
    if (exited) throw new Error("Vite exited: " + output);
    try {
      const response = await fetch(ORIGIN + "/study", {
        signal: AbortSignal.timeout(1000),
      });
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
  const exited = new Promise((resolveExit) =>
    child.once("exit", () => {
      done = true;
      resolveExit();
    }),
  );
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

function question(id, title, state) {
  return {
    id,
    author: { displayName: "Estudiante" },
    academic: {
      subject: { id: SUBJECT_A, name: "Análisis Matemático" },
      courseOffering: null,
    },
    title,
    body: "Consulta de prueba",
    state,
    answerCount: 0,
    acceptedAnswerId: null,
    revision: 1,
    viewer: {
      canEdit: false,
      canAnswer: false,
      canAcceptAnswers: false,
      canReport: false,
    },
    createdAt: "2026-01-01T10:00:00Z",
    updatedAt: "2026-01-01T10:00:00Z",
  };
}

const openQuestion = question(QUESTION_OPEN, "Pregunta de integrales", "open");
const closedQuestion = question(
  QUESTION_CLOSED,
  "Integrales por partes",
  "closed",
);
const secondQuestion = question(
  QUESTION_SECOND,
  "Pregunta cerrada de la segunda página",
  "closed",
);

async function main() {
  let server;
  let browser;
  let denied = false;
  let savedRequests = 0;
  let testSources = false;
  let availableStatus = 200;
  let failQuestionPage = true;
  const sourceResource = (kind) => ({
    id: kind === "saved" ? SUBJECT_A : SUBJECT_B,
    title: `Source ${kind}`,
    academic: { subject: { id: SUBJECT_B, name: "Álgebra" } },
    file: { filename: "source.pdf" },
  });
  const questionRequests = [];
  try {
    server = await boot();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    await context.route(API + "/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (request.method() !== "GET") {
        throw new Error(
          "The Workbench explorer must not write through the API",
        );
      }
      if (path === "/auth/me") {
        await json(
          route,
          denied ? { code: "AUTHENTICATION_REQUIRED" } : SESSION,
          denied ? 401 : 200,
        );
      } else if (path === "/discovery/contextual") {
        await json(route, {
          subjects: [
            {
              subject: { id: SUBJECT_A, name: "Análisis Matemático" },
              resources: [],
            },
            { subject: { id: SUBJECT_B, name: "Álgebra" }, resources: [] },
          ],
        });
      } else if (path === "/resources/saved/search") {
        savedRequests++;
        await json(route, {
          items: testSources ? [sourceResource("saved")] : [],
          nextCursor: testSources ? "saved-page" : null,
        });
      } else if (path === "/resources") {
        if (testSources && availableStatus !== 200) {
          await json(
            route,
            {
              code: "SOURCE_UNAVAILABLE",
              message: `Source failure ${availableStatus}`,
            },
            availableStatus,
          );
        } else {
          await json(route, {
            items: testSources ? [sourceResource("available")] : [],
            nextCursor: testSources ? "available-page" : null,
          });
        }
      } else if (path === "/questions") {
        const params = Object.fromEntries(url.searchParams.entries());
        questionRequests.push(params);
        if (params.subjectId === SUBJECT_B) {
          await json(route, { items: [], nextCursor: null });
        } else if (params.cursor === "page-3") {
          if (failQuestionPage) {
            failQuestionPage = false;
            await json(
              route,
              { code: "TEMPORARY", message: "Question page unavailable" },
              500,
            );
          } else {
            await json(route, {
              items: [secondQuestion, closedQuestion],
              nextCursor: "page-2",
            });
          }
        } else if (params.cursor === "page-2") {
          await json(route, {
            items: [
              { ...openQuestion, title: "Pregunta principal actualizada" },
              secondQuestion,
            ],
            nextCursor: "page-3",
          });
        } else if (params.q === "integrales" && params.status === "closed") {
          await json(route, { items: [closedQuestion], nextCursor: null });
        } else if (params.q === "integrales") {
          await json(route, { items: [openQuestion], nextCursor: null });
        } else if (!params.q && !params.status) {
          await json(route, { items: [openQuestion], nextCursor: "page-2" });
        } else {
          await json(route, { items: [openQuestion], nextCursor: null });
        }
      } else {
        await json(route, { items: [], nextCursor: null });
      }
    });

    const page = await context.newPage();
    await page.goto(ORIGIN + "/study?subjectId=" + SUBJECT_A, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: "Preguntas de la materia" })
      .waitFor({ timeout: 15000 });
    const panel = page.getByRole("region", {
      name: "Preguntas de la materia",
    });
    const search = panel.getByLabel("Buscar por tema");
    const status = panel.getByLabel("Estado");
    await panel.getByText("Pregunta de integrales", { exact: true }).waitFor();
    await page
      .getByText("No tenés guardados visibles en esta materia.", {
        exact: false,
      })
      .waitFor();
    await delay(100);
    assert.equal(await status.inputValue(), "open");
    const initialRequestCount = questionRequests.length;
    assert.ok(initialRequestCount >= 1);
    assert.ok(
      questionRequests.every(
        (params) => params.subjectId === SUBJECT_A && params.status === "open",
      ),
      "the default query must be restricted to the active subject and open questions",
    );
    const savedBaseline = savedRequests;
    assert.ok(savedBaseline > 0, "saved materials were not loaded");

    await search.fill("i");
    assert.equal(
      await panel
        .getByRole("button", { name: "Buscar preguntas" })
        .isDisabled(),
      true,
    );
    await panel
      .getByRole("alert")
      .getByText("Usá entre 2 y 120 caracteres", { exact: false })
      .waitFor();
    await search.fill("integrales");
    await delay(150);
    assert.equal(
      questionRequests.length,
      initialRequestCount,
      "typing triggered a request",
    );
    assert.equal(
      savedRequests,
      savedBaseline,
      "typing refreshed saved materials",
    );

    await panel.getByRole("button", { name: "Buscar preguntas" }).click();
    await panel
      .getByText("Mostrando preguntas abiertas sobre «integrales».", {
        exact: true,
      })
      .waitFor();
    await panel.getByText("Pregunta de integrales", { exact: true }).waitFor();
    assert.equal(questionRequests.length, initialRequestCount + 1);
    assert.equal(questionRequests.at(-1).q, "integrales");
    assert.equal(questionRequests.at(-1).status, "open");

    await status.selectOption("closed");
    await delay(100);
    assert.equal(
      questionRequests.length,
      initialRequestCount + 1,
      "changing a filter triggered a request",
    );
    await panel.getByRole("button", { name: "Buscar preguntas" }).click();
    await panel
      .getByText("Mostrando preguntas cerradas sobre «integrales».", {
        exact: true,
      })
      .waitFor();
    await panel.getByText("Integrales por partes", { exact: true }).waitFor();
    assert.equal(questionRequests.length, initialRequestCount + 2);
    assert.equal(questionRequests.at(-1).q, "integrales");
    assert.equal(questionRequests.at(-1).status, "closed");
    assert.equal(
      savedRequests,
      savedBaseline,
      "filter search refreshed saved materials",
    );

    await search.fill("");
    await status.selectOption("");
    await panel.getByRole("button", { name: "Buscar preguntas" }).click();
    await panel
      .getByText("Mostrando todas las preguntas.", { exact: true })
      .waitFor();
    await panel.getByText("Pregunta de integrales", { exact: true }).waitFor();
    assert.equal(questionRequests.length, initialRequestCount + 3);
    await panel.getByRole("button", { name: "Más preguntas" }).click();
    await panel
      .getByText("Pregunta principal actualizada", { exact: true })
      .waitFor();
    assert.equal(questionRequests.length, initialRequestCount + 4);
    assert.equal(questionRequests.at(-2).q, undefined);
    assert.equal(questionRequests.at(-2).status, undefined);
    assert.equal(questionRequests.at(-1).cursor, "page-2");
    assert.equal(
      await panel.locator("ul > li").count(),
      2,
      "pagination did not deduplicate the repeated question ID",
    );
    assert.equal(
      await panel
        .getByRole("link", { name: "Practicar esta pregunta" })
        .count(),
      2,
    );
    assert.equal(
      savedRequests,
      savedBaseline,
      "pagination refreshed saved materials",
    );

    await panel.getByRole("button", { name: "Más preguntas" }).click();
    await panel
      .getByText("Question page unavailable", { exact: true })
      .waitFor();
    assert.equal(await panel.locator("ul > li").count(), 2);
    await panel
      .getByRole("button", { name: "Reintentar", exact: true })
      .click();
    await panel.getByText("Pregunta de integrales", { exact: true }).waitFor();
    await panel.getByRole("button", { name: "Más preguntas" }).click();
    await panel
      .getByText("Pregunta principal actualizada", { exact: true })
      .waitFor();
    await panel.getByRole("button", { name: "Más preguntas" }).click();
    await panel
      .getByText(/El servidor repitió una página de preguntas/)
      .waitFor();
    assert.equal(await panel.locator("ul > li").count(), 3);
    assert.equal(
      await panel.getByText("Integrales por partes", { exact: true }).count(),
      1,
    );
    assert.equal(
      await panel.getByRole("button", { name: "Más preguntas" }).count(),
      0,
    );
    assert.deepEqual(
      questionRequests.slice(-6).map((x) => x.cursor),
      [undefined, "page-2", "page-3", undefined, "page-2", "page-3"],
    );
    await panel
      .getByRole("button", { name: "Reintentar", exact: true })
      .click();
    await panel.getByText("Pregunta de integrales", { exact: true }).waitFor();
    await panel.getByRole("button", { name: "Más preguntas" }).click();
    await panel
      .getByText("Pregunta principal actualizada", { exact: true })
      .waitFor();
    await page.locator("#study-subject").selectOption(SUBJECT_B);
    await page.waitForURL(ORIGIN + "/study?subjectId=" + SUBJECT_B);
    await page.waitForFunction(() => {
      const input = document.querySelector(
        '.study-workbench-question-filters input[type="search"]',
      );
      const select = document.querySelector(
        ".study-workbench-question-filters select",
      );
      return input?.value === "" && select?.value === "open";
    });
    await panel
      .getByText("No hay preguntas visibles con estos filtros.", {
        exact: true,
      })
      .waitFor();
    assert.equal(questionRequests.at(-1).subjectId, SUBJECT_B);
    assert.equal(questionRequests.at(-1).status, "open");

    testSources = true;
    const savedPanel = page.getByRole("region", { name: "Mis guardados" });
    const availablePanel = page.getByRole("region", {
      name: "Apuntes disponibles",
    });
    await savedPanel
      .getByRole("button", { name: "Actualizar guardados" })
      .click();
    await savedPanel.getByRole("link", { name: "Source saved" }).waitFor();
    await availablePanel
      .getByRole("button", { name: "Actualizar apuntes" })
      .click();
    const availableLink = availablePanel.getByRole("link", {
      name: "Source available",
    });
    await availableLink.waitFor();
    await savedPanel
      .getByRole("button", { name: "Mostrar más guardados" })
      .click();
    await savedPanel
      .getByRole("alert")
      .filter({ hasText: "no avanzó" })
      .waitFor();
    assert.equal(
      await savedPanel.getByRole("link", { name: "Source saved" }).count(),
      1,
    );
    assert.equal(
      await savedPanel
        .getByRole("button", { name: "Mostrar más guardados" })
        .count(),
      0,
    );
    assert.equal(
      await availablePanel.getByRole("button", { name: "Más apuntes" }).count(),
      1,
    );

    availableStatus = 500;
    await availablePanel.getByRole("button", { name: "Más apuntes" }).click();
    await availablePanel
      .getByText("Source failure 500", { exact: true })
      .waitFor();
    assert.equal(await availableLink.count(), 1);
    availableStatus = 200;
    await availablePanel.getByRole("button", { name: "Más apuntes" }).click();
    await availablePanel
      .getByRole("alert")
      .filter({ hasText: "no avanzó" })
      .waitFor();
    assert.equal(await availableLink.count(), 1);
    assert.equal(
      await availablePanel.getByRole("button", { name: "Más apuntes" }).count(),
      0,
    );

    for (const statusCode of [401, 403, 404]) {
      availableStatus = 200;
      await availablePanel
        .getByRole("button", { name: "Actualizar apuntes" })
        .click();
      await availablePanel
        .getByRole("button", { name: "Más apuntes" })
        .waitFor();
      availableStatus = statusCode;
      await availablePanel.getByRole("button", { name: "Más apuntes" }).click();
      await availableLink.waitFor({ state: "hidden" });
      assert.equal(
        await availablePanel
          .getByRole("button", { name: "Más apuntes" })
          .count(),
        0,
      );
      assert.equal(
        await savedPanel.getByRole("link", { name: "Source saved" }).count(),
        1,
      );
    }

    denied = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForURL(ORIGIN + "/login", { timeout: 15000 });
    assert.equal(
      await page
        .getByRole("heading", { name: "Preguntas de la materia" })
        .count(),
      0,
    );
    await context.close();
    console.log(
      "PASS Chromium: Q&A filters, independent source cursor recovery, transient retry, 401/403/404 clearing and subject/session scope",
    );
  } finally {
    await browser?.close();
    await stop(server);
  }
}

await main();
