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

const PERSON = "4fc90c37-710f-4c9a-9681-ed0476409b4d";
let writes = 0;
let unsafeReads = 0;
let searches = 0;
let failFollowing = true;
const pageReads = [];
const person = (name, avatarUrl) => ({
  profileId: PERSON,
  displayName: name,
  avatarUrl,
});
let server, browser;
try {
  server = await bootWeb();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.route("https://avatars.example.test/**", (route) =>
    route.request().url().endsWith("broken.png")
      ? route.abort()
      : route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="green"/></svg>',
        }),
  );
  await context.route("http://unsafe.example.test/**", (route) => {
    unsafeReads += 1;
    return route.abort();
  });
  await context.route(API + "/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (value, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": ORIGIN,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify(value),
      });
    if (request.method() !== "GET") {
      writes += 1;
      return reply({});
    }
    if (url.pathname === "/auth/me")
      return reply({
        user: { id: "current-user", email: "network@example.invalid" },
        session: {
          id: "session",
          current: true,
          clientType: "web",
          expiresAt: "2027-01-01T00:00:00Z",
        },
      });
    if (
      ["/social/me/following", "/social/me/connections"].includes(url.pathname)
    ) {
      const cursor = url.searchParams.get("cursor");
      const isFollowing = url.pathname.endsWith("following");
      pageReads.push({ path: url.pathname, cursor });
      if (isFollowing && cursor === "cursor-a" && failFollowing) {
        failFollowing = false;
        return reply(
          { code: "TEMPORARY", message: "Following page unavailable" },
          500,
        );
      }
      const count = cursor === "cursor-b" ? 3 : cursor ? 2 : 1;
      const items = Array.from({ length: count }, (_, index) => {
        const profile = {
          ...person(
            index === 0
              ? isFollowing
                ? "Ana seguida"
                : "Bruno solicitud"
              : `${isFollowing ? "Seguido" : "Solicitud"} ${index + 1}`,
            index === 0 && !isFollowing
              ? "https://avatars.example.test/broken.png"
              : "https://avatars.example.test/good.svg",
          ),
          profileId:
            index === 0
              ? PERSON
              : `00000000-0000-4000-8000-00000000000${index}`,
        };
        return isFollowing
          ? { profile }
          : {
              id: `connection-${index}`,
              incoming: true,
              status: "pending",
              other: profile,
            };
      });
      return reply({
        items,
        nextCursor:
          cursor === "cursor-b" ? "cursor-a" : cursor ? "cursor-b" : "cursor-a",
      });
    }
    if (url.pathname === "/search") {
      searches += 1;
      return reply({
        results: {
          people: [
            person(
              "Carla encontrada",
              searches === 1
                ? "http://unsafe.example.test/image.png"
                : "https://avatars.example.test/new.svg",
            ),
          ],
        },
      });
    }
    return reply({ items: [], nextCursor: null });
  });
  const page = await context.newPage();
  await page.goto(ORIGIN + "/network");
  const following = page.locator("li").filter({ hasText: "Ana seguida" });
  await following.getByText("Ana seguida", { exact: true }).waitFor();
  await following.scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".network-person-summary img")].some(
      (img) => img.naturalWidth > 0,
    ),
  );
  assert.equal(
    await following
      .locator(".public-profile-avatar")
      .evaluate((node) => getComputedStyle(node).width),
    "48px",
  );
  assert.equal(
    await following
      .locator(".public-profile-avatar")
      .getAttribute("aria-hidden"),
    "true",
  );
  assert.equal(
    await following
      .getByRole("link", { name: "Perfil", exact: true })
      .getAttribute("href"),
    "/p/" + PERSON,
  );
  const connection = page.locator("li").filter({ hasText: "Bruno solicitud" });
  await connection.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelector('img[src$="broken.png"]')?.hidden === true,
  );
  assert.equal(
    await connection.locator(".public-profile-avatar > span").textContent(),
    "B",
  );
  assert.equal(
    await connection
      .getByRole("button", { name: "Aceptar", exact: true })
      .count(),
    1,
  );
  await page
    .getByRole("textbox", { name: "Buscar personas", exact: true })
    .fill("Carla");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const result = page.locator("li").filter({ hasText: "Carla encontrada" });
  await result.getByText("Carla encontrada", { exact: true }).waitFor();
  assert.equal(await result.locator("img").count(), 0);
  assert.equal(
    await result.locator(".public-profile-avatar > span").textContent(),
    "C",
  );
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('img[src$="new.svg"]')?.naturalWidth > 0,
  );
  assert.equal(
    await result.getByRole("button", { name: "Seguir", exact: true }).count(),
    1,
  );
  assert.equal(
    await result.getByRole("button", { name: "Conectar", exact: true }).count(),
    1,
  );
  const followsPanel = page.locator(".community-card").filter({
    has: page.getByRole("heading", { name: "Siguiendo", exact: true }),
  });
  const connectionsPanel = page.locator(".network-relationships");
  await followsPanel
    .getByRole("button", { name: "Cargar más", exact: true })
    .click();
  await page.getByText("Following page unavailable", { exact: true }).waitFor();
  assert.equal(await followsPanel.locator("li").count(), 1);
  await followsPanel
    .getByRole("button", { name: "Cargar más", exact: true })
    .click();
  await followsPanel.getByText("Seguido 2", { exact: true }).waitFor();
  await followsPanel
    .getByRole("button", { name: "Cargar más", exact: true })
    .click();
  await page.getByText(/La red devolvió una página repetida/).waitFor();
  assert.equal(await followsPanel.locator("li").count(), 3);
  assert.equal(
    await followsPanel.getByText("Seguido 3", { exact: true }).count(),
    1,
  );
  assert.equal(
    await followsPanel
      .getByRole("button", { name: "Cargar más", exact: true })
      .count(),
    0,
  );
  await connectionsPanel
    .getByRole("button", { name: "Ver más relaciones", exact: true })
    .click();
  await connectionsPanel.getByText("Solicitud 2", { exact: true }).waitFor();
  await connectionsPanel
    .getByRole("button", { name: "Ver más relaciones", exact: true })
    .click();
  await page.getByText(/La red devolvió una página repetida/).waitFor();
  assert.equal(await connectionsPanel.locator("li").count(), 3);
  assert.equal(
    await connectionsPanel.getByText("Solicitud 3", { exact: true }).count(),
    1,
  );
  assert.equal(
    await connectionsPanel
      .getByRole("button", { name: "Ver más relaciones", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(
    pageReads
      .filter((x) => x.path.endsWith("following") && x.cursor)
      .map((x) => x.cursor),
    ["cursor-a", "cursor-a", "cursor-b"],
  );
  assert.deepEqual(
    pageReads
      .filter((x) => x.path.endsWith("connections") && x.cursor)
      .map((x) => x.cursor),
    ["cursor-a", "cursor-b"],
  );
  assert.equal(unsafeReads, 0);
  assert.equal(writes, 0);
  await context.close();
  console.log(
    "PASS Chromium: compact avatars in following/connections/search, image fallback, safe URL policy, URL refresh and preserved actions",
  );
} finally {
  await browser?.close();
  await stopWeb(server);
}
