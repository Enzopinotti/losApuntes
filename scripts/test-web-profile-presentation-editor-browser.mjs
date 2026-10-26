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
  avatarUrl: null,
  languages: [],
  skills: [],
  interests: [],
  helpTopics: [],
  learningTopics: [],
  professional: { headline: null, careerDiscoveryOptIn: false },
  presentation: {
    accentPreset: "indigo",
    coverPreset: "gradient",
    sectionOrder: ["about", "skills", "activities"],
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
const response = () => ({
  profile,
  onboardingRequired: false,
  academic: { affiliations: [], participations: [], currentContext: null },
  activities: [],
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
          "access-control-allow-methods": "GET,PATCH,OPTIONS",
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
        revision: profile.revision + 1,
        presentation: {
          ...profile.presentation,
          accentPreset: "slate",
          coverPreset: "campus",
        },
      };
      return reply(200, { profile });
    }
    return reply(404, { code: "NOT_FOUND" });
  });
  const page = await context.newPage();
  await page.goto(ORIGIN + "/profile");
  const accent = page.getByLabel("Color de acento", { exact: true });
  const cover = page.getByLabel("Portada", { exact: true });
  await accent.waitFor();
  assert.equal(await accent.inputValue(), "indigo");
  assert.equal(await cover.inputValue(), "gradient");
  await accent.selectOption("emerald");
  await cover.selectOption("paper");
  assert.equal(writes.length, 0);
  await page
    .getByRole("button", { name: "Guardar perfil", exact: true })
    .click();
  await page.getByText("Perfil actualizado.", { exact: true }).waitFor();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].expectedRevision, 7);
  assert.deepEqual(writes[0].presentation, {
    accentPreset: "emerald",
    coverPreset: "paper",
  });
  assert.deepEqual(writes[0].visibility, visibility);
  assert.equal(await accent.inputValue(), "slate");
  assert.equal(await cover.inputValue(), "campus");
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
  await context.close();
  console.log(
    "PASS Chromium: owner presentation hydration, explicit save, current revision, privacy payload, server canonical values and conflict retention",
  );
} finally {
  await browser?.close();
  await stopWeb(server);
}
