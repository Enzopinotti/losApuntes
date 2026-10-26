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
let projectedOrder = ["activities", "skills", "activities", "professional"];
let avatarUrl = "https://avatars.example.test/broken.png";
let publishAbout = true;
let presentation = { accentPreset: "emerald", coverPreset: "paper" };
const projection = () => ({
  profile: {
    id: PROFILE,
    about: publishAbout
      ? { displayName: "Perfil de prueba", bio: "Biografía visible", avatarUrl }
      : undefined,
    presentation: { sectionOrder: projectedOrder, ...presentation },
    skills: { skills: ["Álgebra"], interests: [], languages: [] },
    learning: { helpTopics: ["No proyectado"], learningTopics: [] },
    professional: { headline: "Titular público" },
    activities: [
      {
        id: "activity",
        title: "Proyecto",
        description: "Texto público",
        url: "https://example.test/project",
      },
    ],
    activitiesNextCursor: "cursor-a",
  },
});
let server, browser;
try {
  server = await bootWeb();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route("https://avatars.example.test/**", (route) =>
    route.request().url().endsWith("broken.png")
      ? route.abort()
      : route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="green"/></svg>',
        }),
  );
  await context.route(API + "/**", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      status: url.pathname.startsWith("/profiles/") ? 200 : 401,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": ORIGIN,
        "access-control-allow-credentials": "true",
      },
      body: JSON.stringify(
        url.pathname.endsWith("/activities")
          ? { items: [], nextCursor: "cursor-a" }
          : url.pathname === "/profiles/" + PROFILE
            ? projection()
            : { code: "AUTHENTICATION_REQUIRED" },
      ),
    });
  });
  const page = await context.newPage();
  await page.goto(ORIGIN + "/p/" + PROFILE);
  await page.getByRole("heading", { name: "Perfil de prueba" }).waitFor();
  const headings = page.locator(".profile-grid > section > h2");
  assert.deepEqual(await headings.allTextContents(), [
    "Proyectos y actividades",
    "Habilidades e intereses",
    "Proyección profesional",
  ]);
  assert.equal(await page.getByText("No proyectado").count(), 0);
  const external = page.getByRole("link", {
    name: "Abrir enlace externo de Proyecto en example.test",
  });
  assert.equal(
    await external.getAttribute("href"),
    "https://example.test/project",
  );
  assert.equal(await external.getAttribute("rel"), "noopener noreferrer");
  assert.equal(await external.getAttribute("target"), "_blank");
  const avatar = page.locator(".public-profile-avatar img");
  await page.waitForFunction(
    () => document.querySelector(".public-profile-avatar img")?.hidden === true,
  );
  assert.equal(
    await page.locator(".public-profile-avatar > span").textContent(),
    "P",
  );
  await page.getByRole("button", { name: "Cargar más actividades" }).click();
  await page.getByRole("button", { name: "Actualizar actividades" }).waitFor();
  avatarUrl = "https://avatars.example.test/recovered.svg";
  await page.getByRole("button", { name: "Actualizar actividades" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".public-profile-avatar img")
      ?.getAttribute("src")
      ?.endsWith("recovered.svg"),
  );
  assert.equal(
    await avatar.getAttribute("hidden"),
    null,
    "a new URL must not inherit the failed image's hidden state",
  );
  await page.waitForFunction(
    () =>
      document.querySelector(".public-profile-avatar img")?.naturalWidth > 0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.deepEqual(await headings.allTextContents(), [
    "Proyectos y actividades",
    "Habilidades e intereses",
    "Proyección profesional",
  ]);
  projectedOrder = ["professional", "activities"];
  await page.reload();
  await page.getByRole("heading", { name: "Perfil de prueba" }).waitFor();
  assert.deepEqual(await headings.allTextContents(), [
    "Proyección profesional",
    "Proyectos y actividades",
  ]);
  projectedOrder = [];
  await page.reload();
  await page.getByRole("heading", { name: "Perfil de prueba" }).waitFor();
  assert.equal(await headings.count(), 0);
  publishAbout = false;
  await page.reload();
  await page.getByRole("heading", { name: "Perfil privado" }).waitFor();
  assert.equal(await page.locator(".public-profile-avatar").count(), 0);
  for (const [accent, cover, expectedAccent, expectedCover] of [
    ["emerald", "paper", "emerald", "paper"],
    ["slate", "campus", "slate", "campus"],
    ["unexpected-value", "url(https://example.test/cover)", "default", "none"],
  ]) {
    presentation = { accentPreset: accent, coverPreset: cover };
    await page.reload();
    await page.getByRole("heading", { name: "Perfil privado" }).waitFor();
    const profile = page.locator(".public-profile");
    assert.equal(await profile.getAttribute("data-accent"), expectedAccent);
    assert.equal(await profile.getAttribute("data-cover"), expectedCover);
    const hero = page.locator(".profile-hero");
    if (expectedCover === "paper") {
      assert.equal(
        await hero.evaluate((node) => getComputedStyle(node).backgroundColor),
        "rgb(248, 244, 233)",
      );
    } else {
      const background = await hero.evaluate(
        (node) => getComputedStyle(node).backgroundImage,
      );
      assert.equal(
        background.includes("linear-gradient"),
        expectedCover === "campus",
      );
    }
  }
  await context.close();
  console.log(
    "PASS Chromium: projected public sections match DOM order, absent/duplicate sections omitted, responsive order and safe activity links",
  );
} finally {
  await browser?.close();
  await stopWeb(server);
}
