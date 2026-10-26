import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5191";
const API = "http://127.0.0.1:4000";
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
async function bootWeb() {
  const child = spawn(
    process.execPath,
    [VITE, "--host", "127.0.0.1", "--port", "5191", "--strictPort"],
    {
      cwd: resolve(ROOT, "apps/web"),
      env: { ...process.env, CI: "true", VITE_API_BASE_URL: API },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let exited = false;
  let startError = null;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-4000);
    });
  }
  child.on("exit", () => {
    exited = true;
  });
  child.on("error", (error) => {
    startError = error;
  });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (startError) throw startError;
    if (exited) throw new Error("Vite exited: " + output);
    try {
      const response = await fetch(ORIGIN + "/resources", {
        signal: AbortSignal.timeout(900),
      });
      if (response.ok) return child;
    } catch {
      // Wait for local Vite readiness.
    }
    await delay(250);
  }
  child.kill("SIGTERM");
  throw new Error("Vite readiness timeout: " + output);
}
async function stopWeb(child) {
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

const PROFILE = "4fc90c37-710f-4c9a-9681-ed0476409b4d";
const timestamp = "2026-10-01T00:00:00.000Z";
const visibility = Object.fromEntries(
  [
    "about",
    "academic",
    "learning",
    "activities",
    "skills",
    "professional",
    "contributions",
  ].map((section) => [section, section === "about" ? "public" : "private"]),
);
let profile = {
  id: PROFILE,
  displayName: "Mi perfil",
  bio: null,
  avatarUrl: "https://avatars.example.test/saved.png",
  languages: [],
  skills: [],
  interests: [],
  helpTopics: [],
  learningTopics: [],
  professional: { headline: null, careerDiscoveryOptIn: false },
  presentation: {
    accentPreset: "indigo",
    coverPreset: "gradient",
    sectionOrder: Object.keys(visibility),
  },
  visibility,
  recommendationSignals: {
    academicContext: true,
    learning: false,
    skillsInterests: false,
  },
  revision: 7,
  createdAt: timestamp,
  updatedAt: timestamp,
};
let activity = {
  id: "f93ebfb6-57c6-4e7f-9910-a5363b6840ce",
  type: "project",
  title: "Proyecto original",
  description: "Descripción",
  url: "https://example.test/original",
  startedOn: "2024-01",
  endedOn: null,
  revision: 4,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const activityWrites = [];
let rejectActivity = false;
const response = () => ({
  profile,
  onboardingRequired: false,
  academic: { affiliations: [], participations: [], currentContext: null },
  activities: [activity],
  activitiesNextCursor: null,
  activitiesLimit: 20,
  contributions: { available: false, items: [] },
});
const writes = [];
let rejectUpdate = false;
let server, browser;
try {
  server = await bootWeb();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route(API + "/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (status, value) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": ORIGIN,
          "access-control-allow-credentials": "true",
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "GET,PATCH,POST,OPTIONS",
        },
        body: JSON.stringify(value),
      });
    if (request.method() === "OPTIONS") return reply(204, null);
    if (url.pathname === "/auth/me")
      return reply(200, {
        user: { id: PROFILE, email: "profile@example.invalid" },
        session: {
          id: "b3f1c920-f2c4-41ac-984b-1c0da61c92b7",
          current: true,
          clientType: "web",
          createdAt: timestamp,
          lastSeenAt: timestamp,
          expiresAt: "2027-01-01T00:00:00.000Z",
        },
      });
    if (url.pathname === "/profile/me" && request.method() === "GET")
      return reply(200, response());
    if (url.pathname === "/profile/me" && request.method() === "PATCH") {
      const input = request.postDataJSON();
      writes.push(input);
      if (rejectUpdate)
        return reply(409, {
          code: "REVISION_CONFLICT",
          message: "Revisá el perfil actualizado",
        });
      profile = {
        ...profile,
        avatarUrl: input.avatarUrl,
        revision: profile.revision + 1,
        presentation: {
          ...profile.presentation,
          sectionOrder: input.presentation.sectionOrder,
          accentPreset: "slate",
          coverPreset: "campus",
        },
      };
      return reply(200, { profile });
    }
    if (
      url.pathname === "/profile/me/activities/" + activity.id &&
      request.method() === "PATCH"
    ) {
      const input = request.postDataJSON();
      activityWrites.push(input);
      if (rejectActivity)
        return reply(409, { code: "PROFILE_ACTIVITY_REVISION_CONFLICT" });
      activity = {
        ...activity,
        ...input,
        title: "Título canónico del servidor",
        revision: activity.revision + 1,
      };
      return reply(200, { activity });
    }
    if (
      url.pathname === "/profile/me/activities" &&
      request.method() === "POST"
    ) {
      activityWrites.push(request.postDataJSON());
      return reply(201, { activity });
    }
    return reply(404, { code: "NOT_FOUND" });
  });
  const page = await context.newPage();
  await page.goto(ORIGIN + "/profile");
  const accent = page.getByLabel("Color de acento", { exact: true });
  const cover = page.getByLabel("Portada", { exact: true });
  const avatar = page.getByLabel("Avatar (URL HTTPS)", { exact: true });
  await accent.waitFor();
  assert.equal(await accent.inputValue(), "indigo");
  assert.equal(await cover.inputValue(), "gradient");
  assert.equal(
    await avatar.inputValue(),
    "https://avatars.example.test/saved.png",
  );
  await avatar.fill("http://avatars.example.test/insecure.png");
  assert.equal(await avatar.evaluate((node) => node.checkValidity()), false);
  await page
    .getByRole("button", { name: "Guardar perfil", exact: true })
    .click();
  assert.equal(writes.length, 0);
  await avatar.fill("  https://avatars.example.test/new.png  ");
  assert.equal(
    await avatar.evaluate((node) => node.checkValidity()),
    true,
    "a trimmed HTTPS avatar URL must be submittable",
  );
  const sectionLabels = page.locator(".profile-section-order > li > span");
  assert.equal(await sectionLabels.count(), 7);
  assert.equal(
    await page
      .getByRole("button", { name: "Subir Presentación", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Bajar Contribuciones", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Bajar Presentación", exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Subir Contribuciones", exact: true })
    .press("Enter");
  const orderedLabels = [
    "Trayectoria académica",
    "Presentación",
    "Aprendizaje y ayuda",
    "Proyectos y actividades",
    "Habilidades e intereses",
    "Contribuciones",
    "Proyección profesional",
  ];
  assert.deepEqual(await sectionLabels.allTextContents(), orderedLabels);
  await accent.selectOption("emerald");
  await cover.selectOption("paper");
  assert.equal(writes.length, 0);
  await page
    .getByRole("button", { name: "Guardar perfil", exact: true })
    .click();
  await page.getByText("Perfil actualizado.", { exact: true }).waitFor();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].expectedRevision, 7);
  assert.equal(writes[0].avatarUrl, "https://avatars.example.test/new.png");
  assert.deepEqual(writes[0].presentation, {
    accentPreset: "emerald",
    coverPreset: "paper",
    sectionOrder: [
      "academic",
      "about",
      "learning",
      "activities",
      "skills",
      "contributions",
      "professional",
    ],
  });
  assert.deepEqual(writes[0].visibility, visibility);
  assert.equal(await accent.inputValue(), "slate");
  assert.equal(await cover.inputValue(), "campus");
  assert.equal(
    await avatar.inputValue(),
    "https://avatars.example.test/new.png",
  );
  assert.deepEqual(await sectionLabels.allTextContents(), orderedLabels);
  rejectUpdate = true;
  await accent.selectOption("rose");
  await page
    .getByRole("button", { name: "Guardar perfil", exact: true })
    .click();
  await page
    .getByText("Revisá el perfil actualizado", { exact: true })
    .waitFor();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].expectedRevision, 8);
  assert.equal(await accent.inputValue(), "rose");
  assert.equal(await cover.inputValue(), "campus");
  assert.deepEqual(
    writes[1].presentation.sectionOrder,
    writes[0].presentation.sectionOrder,
  );
  assert.deepEqual(await sectionLabels.allTextContents(), orderedLabels);
  rejectUpdate = false;
  await avatar.fill("");
  await page
    .getByRole("button", { name: "Guardar perfil", exact: true })
    .click();
  await page.getByText("Perfil actualizado.", { exact: true }).waitFor();
  assert.equal(writes.length, 3);
  assert.equal(writes[2].expectedRevision, 8);
  assert.equal(writes[2].avatarUrl, null);
  assert.equal(await avatar.inputValue(), "");
  const activities = page.locator(".profile-activities");
  await activities.getByRole("button", { name: "Editar", exact: true }).click();
  const edit = page.locator(".profile-activity-edit-form");
  assert.equal(
    await edit.getByLabel("Título", { exact: true }).inputValue(),
    "Proyecto original",
  );
  await edit.getByLabel("Título", { exact: true }).fill("  Título editado  ");
  await edit
    .getByLabel("URL pública (HTTPS)", { exact: true })
    .fill("  https://example.test/updated  ");
  assert.equal(
    await edit
      .getByLabel("URL pública (HTTPS)", { exact: true })
      .evaluate((node) => node.checkValidity()),
    true,
  );
  await edit
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page.getByText("Actividad actualizada.", { exact: true }).waitFor();
  await activities
    .getByText("Título canónico del servidor", { exact: true })
    .waitFor();
  assert.equal(activityWrites[0].expectedRevision, 4);
  assert.equal(activityWrites[0].title, "Título editado");
  assert.equal(activityWrites[0].url, "https://example.test/updated");
  rejectActivity = true;
  await activities.getByRole("button", { name: "Editar", exact: true }).click();
  await edit
    .getByLabel("Título", { exact: true })
    .fill("Borrador en conflicto");
  await edit
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page
    .getByText(
      "La actividad cambió en otra pestaña. Recargá el perfil antes de guardar.",
      { exact: true },
    )
    .waitFor();
  assert.equal(activityWrites[1].expectedRevision, 5);
  assert.equal(
    await edit.getByLabel("Título", { exact: true }).inputValue(),
    "Borrador en conflicto",
  );
  await edit.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.equal(activityWrites.length, 2);
  rejectActivity = false;
  await activities.getByRole("button", { name: "Editar", exact: true }).click();
  await edit.getByLabel("URL pública (HTTPS)", { exact: true }).fill("");
  await edit
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page.getByText("Actividad actualizada.", { exact: true }).waitFor();
  assert.equal(activityWrites[2].expectedRevision, 5);
  assert.equal(activityWrites[2].url, null);
  const create = page.locator(".profile-activity-form");
  await create.getByLabel("Título", { exact: true }).fill("Nueva actividad");
  await create
    .getByLabel("URL pública (HTTPS)", { exact: true })
    .fill("  https://example.test/new  ");
  assert.equal(
    await create
      .getByLabel("URL pública (HTTPS)", { exact: true })
      .evaluate((node) => node.checkValidity()),
    true,
  );
  await create
    .getByRole("button", { name: "Agregar actividad", exact: true })
    .click();
  await page.getByText("Actividad agregada.", { exact: true }).waitFor();
  assert.equal(activityWrites[3].url, "https://example.test/new");
  await context.close();
  console.log(
    "PASS Chromium: owner presentation hydration, explicit save, current revision, privacy payload, server canonical values and conflict retention",
  );
} finally {
  await browser?.close();
  await stopWeb(server);
}
