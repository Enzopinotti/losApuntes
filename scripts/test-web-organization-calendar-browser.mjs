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

const { readFile } = await import("node:fs/promises");
const ORGANIZATION = "4fc90c37-710f-4c9a-9681-ed0476409b4d";
const event = {
  id: "event-a",
  title: "Taller, práctica;",
  description: "Una actividad útil",
  startsAt: "2026-11-03T18:00:00-03:00",
  endsAt: "2026-11-03T19:30:00-03:00",
  locationLabel: "Aula 12",
  externalUrl: "https://example.test/event",
  state: "scheduled",
  revision: 1,
};
const organization = {
  id: ORGANIZATION,
  name: "Organización de prueba",
  type: "club",
  about: null,
  avatarUrl: null,
  coverUrl: null,
  websiteUrl: null,
  claimState: "claimed",
  verificationState: "verified",
  scope: {
    institution: { id: ORGANIZATION, name: "Universidad" },
    campus: null,
    academicUnit: null,
    program: null,
  },
  followerCount: 0,
  managers: [],
  links: [],
  featuredResources: [],
  posts: [],
  postsNextCursor: null,
  events: [
    event,
    {
      ...event,
      id: "event-b",
      title: "Evento cancelado de prueba",
      state: "cancelled",
    },
  ],
  eventsNextCursor: null,
};
let server, browser;
let writes = 0;
try {
  server = await bootWeb();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.route(API + "/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") writes += 1;
    return route.fulfill({
      status: path === "/organizations/" + ORGANIZATION ? 200 : 401,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": ORIGIN,
        "access-control-allow-credentials": "true",
      },
      body: JSON.stringify(
        path === "/organizations/" + ORGANIZATION
          ? { organization }
          : { code: "AUTHENTICATION_REQUIRED" },
      ),
    });
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(ORIGIN + "/organizations/" + ORGANIZATION);
  await page
    .getByRole("heading", { name: "Organización de prueba", exact: true })
    .waitFor();
  const cancelled = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Evento cancelado de prueba",
      exact: true,
    }),
  });
  assert.equal(
    await cancelled
      .getByRole("button", { name: /Descargar calendario/ })
      .count(),
    0,
  );
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Descargar calendario para Taller, práctica;",
      exact: true,
    })
    .click();
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), "taller-practica.ics");
  const contents = await readFile(await download.path(), "utf8");
  assert.match(contents, /BEGIN:VCALENDAR\r\n/);
  assert.match(contents, /DTSTART:20261103T210000Z\r\n/);
  assert.match(contents, /DTEND:20261103T223000Z\r\n/);
  assert.match(contents, /SUMMARY:Taller\\, práctica\\;\r\n/);
  assert.match(contents, /LOCATION:Aula 12\r\n/);
  assert.ok(contents.includes("https://example.test/event"));
  assert.equal(writes, 0);
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log(
    "PASS Chromium: organization event downloads a local UTC ICS with escaped details; cancelled event has no export and no API writes",
  );
} finally {
  await browser?.close();
  await stopWeb(server);
}
