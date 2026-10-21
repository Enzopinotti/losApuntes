import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

import { assertLocalAuthSmokeMongo } from "./auth-local-compose-guard.mjs";

const ROOT = process.cwd();
const API_ORIGIN = "http://localhost:4000";
const WEB_ORIGIN = "http://localhost:5173";
const TIMEOUT_MS = 8_000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function assertLocalRuntime() {
  assertLocalAuthSmokeMongo(ROOT);
  assert.equal(
    process.env.CI,
    "true",
    "Live study acceptance is restricted to disposable CI Compose",
  );
}

async function request(path, { method = "GET", bearer, body } = {}) {
  const response = await fetch(new URL(path, API_ORIGIN), {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(bearer ? { Authorization: bearer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const raw = await response.text();
  let value = null;
  if (raw) {
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
  }
  return { status: response.status, value };
}

async function expected(path, opts, status) {
  const result = await request(path, opts);
  assert.equal(
    result.status,
    status,
    `Unexpected ${result.status} from ${path}: ${JSON.stringify(result.value)}`,
  );
  return result.value;
}

function mongoEval(script) {
  return execFileSync(
    "docker",
    [
      "compose",
      "-f",
      "compose.local.yml",
      "exec",
      "-T",
      "mongo",
      "mongosh",
      "--quiet",
      "losapuntes_local",
      "--eval",
      script,
    ],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

async function actor(label) {
  const email = `b184-${label}-${randomUUID()}@example.test`;
  const password = `Browser ${randomUUID()} ${randomUUID()}!`;
  await expected(
    "/auth/register",
    { method: "POST", body: { email, password } },
    202,
  );
  mongoEval(
    `const result=db.users.updateOne({email:${JSON.stringify(email)}},{$set:{email_verified_at:new Date()}});if(result.matchedCount!==1)quit(2);`,
  );
  const login = await expected(
    "/auth/mobile/login",
    { method: "POST", body: { email, password } },
    200,
  );
  assert.equal(typeof login.sessionToken, "string");
  const bearer = `Bearer ${login.sessionToken}`;
  await expected(
    "/profile/me",
    { method: "POST", bearer, body: { displayName: `B184 ${label}` } },
    201,
  );
  return { email, password, bearer };
}

async function catalogNode(kind, name) {
  const query = new URLSearchParams({ kind, q: name, limit: "20" });
  const result = await expected(`/academic/catalog/search?${query}`, {}, 200);
  const node = result.items.find((item) => item.name === name);
  assert.ok(
    node?.id && UUID_V4.test(node.id),
    `Missing seeded ${kind}: ${name}`,
  );
  return node;
}

async function prepareSubject(student) {
  const institution = await catalogNode(
    "institution",
    "Universidad Runtime Smoke",
  );
  const program = await catalogNode("program", "Ingeniería Runtime");
  const curriculum = await catalogNode("curriculum", "Plan 2026");
  const subject = await catalogNode("subject", "Base de Datos");
  await expected(
    "/academic/me/affiliations",
    {
      method: "POST",
      bearer: student.bearer,
      body: {
        institutionId: institution.id,
        programId: program.id,
        curriculumId: curriculum.id,
        status: "active",
        startedOn: "2026",
      },
    },
    201,
  );
  await expected(
    `/academic/me/subjects/${subject.id}`,
    {
      method: "PUT",
      bearer: student.bearer,
      body: { state: "current", periodLabel: "2026 S2" },
    },
    200,
  );
  const discovery = await expected(
    "/discovery/contextual?subjectLimit=8&resourcesPerSubject=1",
    { bearer: student.bearer },
    200,
  );
  assert.ok(discovery.subjects.some((item) => item.subject.id === subject.id));
  return subject;
}

async function publishResource(author, subject) {
  const name = `integrales b184 ${randomUUID().slice(0, 8)}`;
  const bytes = Buffer.from("%PDF-1.7\nB184-disposable-acceptance\n%%EOF\n");
  const intent = await expected(
    "/files/upload-intents",
    {
      method: "POST",
      bearer: author.bearer,
      body: {
        operationKey: randomUUID(),
        filename: "integrales-b184.pdf",
        mimeType: "application/pdf",
        byteSize: bytes.byteLength,
      },
    },
    201,
  );
  const upload = await fetch(intent.upload.url, {
    method: intent.upload.method,
    headers: intent.upload.headers,
    body: bytes,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  assert.equal(upload.ok, true, "Disposable PDF upload must succeed");
  await expected(
    `/files/${intent.file.id}/finalize`,
    { method: "POST", bearer: author.bearer },
    201,
  );
  const created = await expected(
    "/resources",
    {
      method: "POST",
      bearer: author.bearer,
      body: {
        assetId: intent.file.id,
        title: name,
        description: "Material real de integración B184",
        tags: ["integrales", "b184"],
        subjectId: subject.id,
        visibility: "public",
      },
    },
    201,
  );
  assert.match(created.resource.id, UUID_V4);
  return created.resource;
}

async function changeVisibility(author, resource, visibility) {
  const updated = await expected(
    `/resources/${resource.id}`,
    {
      method: "PATCH",
      bearer: author.bearer,
      body: { expectedRevision: resource.revision, visibility },
    },
    200,
  );
  assert.equal(updated.resource.visibility, visibility);
  return updated.resource;
}

async function createQuestion(student, subject) {
  const title = `¿Cómo repasar integrales b184 ${randomUUID().slice(0, 8)}?`;
  const created = await expected(
    "/questions",
    {
      method: "POST",
      bearer: student.bearer,
      body: {
        subjectId: subject.id,
        title,
        body: "¿Cómo organizar el estudio de estas integrales para el parcial?",
      },
    },
    201,
  );
  assert.match(created.question.id, UUID_V4);
  return created.question;
}

async function startWeb() {
  const child = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort",
    ],
    {
      cwd: `${ROOT}/apps/web`,
      env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let exited = false;
  let logs = "";
  child.on("exit", () => {
    exited = true;
  });
  child.stdout.on("data", (chunk) => {
    logs = (logs + chunk.toString()).slice(-4000);
  });
  child.stderr.on("data", (chunk) => {
    logs = (logs + chunk.toString()).slice(-4000);
  });
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      assert.equal(exited, false, "Vite exited before ready: " + logs);
      try {
        if (
          (
            await fetch(WEB_ORIGIN + "/login", {
              signal: AbortSignal.timeout(700),
            })
          ).ok
        ) {
          return { child, isExited: () => exited };
        }
      } catch {
        // Wait only for this local, disposable process.
      }
      await delay(200);
    }
    throw new Error("Timed out starting local Vite: " + logs);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
}

async function stopWeb(server) {
  if (server.isExited()) return;
  const stopped = new Promise((resolveExit) =>
    server.child.once("exit", resolveExit),
  );
  server.child.kill("SIGTERM");
  await Promise.race([stopped, delay(2500)]);
  if (!server.isExited()) server.child.kill("SIGKILL");
}

async function browserJourney(
  student,
  author,
  subject,
  initialResource,
  question,
) {
  const server = await startWeb();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(WEB_ORIGIN + "/login");
    await page.getByLabel("Email").fill(student.email);
    await page.getByLabel("Contraseña").fill(student.password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await page.waitForURL((url) => url.pathname === "/dashboard");
    const cookies = await context.cookies(API_ORIGIN);
    assert.ok(
      cookies.some(
        (cookie) => cookie.httpOnly && /losapuntes_session/u.test(cookie.name),
      ),
    );

    await page.goto(
      `${WEB_ORIGIN}/search?q=${encodeURIComponent(initialResource.title)}&scope=resources`,
    );
    await page.getByText(initialResource.title).first().waitFor();
    await page
      .getByRole("button", {
        name: `Guardar apunte: ${initialResource.title}`,
      })
      .click();
    await page
      .getByRole("button", {
        name: `Apunte guardado: ${initialResource.title}`,
      })
      .waitFor();
    const saved = await expected(
      "/resources/saved?limit=25",
      { bearer: student.bearer },
      200,
    );
    assert.ok(saved.items.some((item) => item.id === initialResource.id));

    await page.getByRole("link", { name: "Ver recurso" }).click();
    await page.waitForURL(
      (url) => url.pathname === `/resources/${initialResource.id}`,
    );
    const prepare = page.getByRole("button", {
      name: "Preparar sesión con este apunte",
    });
    await prepare.waitFor();

    let currentResource = await changeVisibility(
      author,
      initialResource,
      "private",
    );
    await prepare.click();
    await page
      .getByRole("alert")
      .getByText("Este apunte o tu materia dejaron de estar disponibles.")
      .waitFor();
    assert.equal(
      new URL(page.url()).pathname,
      `/resources/${initialResource.id}`,
    );
    const denied = await request(`/resources/${initialResource.id}`, {
      bearer: student.bearer,
    });
    assert.ok(
      [403, 404].includes(denied.status),
      "Revoked student access must fail at API",
    );

    currentResource = await changeVisibility(author, currentResource, "public");
    await prepare.click();
    await page.waitForURL((url) => url.pathname === "/study/session");
    assert.equal(new URL(page.url()).searchParams.get("subjectId"), subject.id);
    await page
      .getByRole("button", { name: "Sumar actividades sin perder mi plan" })
      .click();
    await page
      .locator(".study-session-summary strong")
      .getByText("1 actividades")
      .waitFor();

    const finder = page.getByRole("region", {
      name: "Encontrar material para tu plan",
    });
    await finder.getByLabel("Qué querés repasar").selectOption("question");
    await finder.getByLabel("Buscar por tema").fill("integrales b184");
    await finder.getByRole("button", { name: "Buscar material" }).click();
    await finder.getByRole("link", { name: question.title }).waitFor();
    await finder.getByRole("button", { name: "Sumar al plan" }).click();
    await page
      .locator(".study-session-summary strong")
      .getByText("2 actividades")
      .waitFor();
    await page.getByText("45 minutos previstos").waitFor();

    await page
      .getByRole("link", { name: "Mis colecciones portátiles" })
      .click();
    await page.waitForURL((url) => url.pathname === "/study/kits");
    const kitForm = page.locator(".study-kits-form").first();
    await kitForm.getByLabel("Nombre").fill("Parcial B184");
    await kitForm.getByRole("button", { name: "Crear colección" }).click();
    const kitFinder = page.getByRole("region", {
      name: "Encontrar un apunte específico",
    });
    await kitFinder
      .getByLabel("Título, descripción o etiqueta")
      .fill("integrales b184");
    await kitFinder.getByRole("button", { name: "Buscar apuntes" }).click();
    await kitFinder
      .getByRole("button", {
        name: `Agregar apunte ${initialResource.title} al kit`,
      })
      .click();
    await page.getByText("1/").first().waitFor();

    assert.deepEqual(
      errors,
      [],
      "Real backend student journey must not throw page errors",
    );
    console.log(
      JSON.stringify({
        event: "b184.live_student_browser",
        status: "PASS",
        api: "real disposable Compose",
        database: "real MongoDB",
        browser: "Chromium",
        savedResource: true,
        revokedAccessRejected: true,
        subjectScopedSession: true,
        questionInPlan: true,
        kitResourceAdded: true,
        releaseAuthorized: false,
      }),
    );
  } finally {
    if (browser) await browser.close();
    await stopWeb(server);
  }
}

assertLocalRuntime();
const health = await expected("/health/ready", {}, 200);
assert.ok(health);
const author = await actor("author");
const student = await actor("student");
const subject = await prepareSubject(student);
const resource = await publishResource(author, subject);
const question = await createQuestion(student, subject);
await browserJourney(student, author, subject, resource, question);
