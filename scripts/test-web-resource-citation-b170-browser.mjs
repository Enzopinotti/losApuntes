import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const ORIGIN = "http://127.0.0.1:5191";
const API = "http://127.0.0.1:4000";
const VITE = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
const PUBLIC_ID = "4fc90c37-710f-4c9a-9681-ed0476409b4d";
const PRIVATE_ID = "8e4a8f43-4e3c-4af3-88df-37e8a5ac7937";

const AUTH = {
  user: {
    id: "6f421f06-1cc0-49c1-96c7-3325c5a3edc7",
    email: "b170@example.invalid",
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

function mockResource(id, visibility) {
  return {
    id,
    title:
      visibility === "public"
        ? "Álgebra lineal: resumen"
        : "Apunte privado de examen",
    description: null,
    tags: [],
    visibility,
    revision: 1,
    file: {
      id: "4fc90c37-710f-4c9a-9681-ed0476409b4d",
      filename: "guia.pdf",
      byteSize: 1800,
      mimeType: "application/pdf",
    },
    academic: {
      subject: {
        id: "104b311b-852c-497d-982c-4d8146a9874a",
        name: "Álgebra I",
      },
    },
    author: { displayName: "Belén Suárez", profileId: null },
    capabilities: { edit: false, manageShares: false },
  };
}

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

async function mountContext(browser, authenticated, blockedPrivate = false) {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: ORIGIN,
  });
  let httpMutations = 0;
  await context.route(API + "/**", async (route) => {
    const url = new URL(route.request().url());
    const send = async (status, body) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": ORIGIN,
          "access-control-allow-credentials": "true",
        },
        body: JSON.stringify(body),
      });
    if (route.request().method() !== "GET") {
      httpMutations++;
      return send(405, { code: "METHOD_NOT_ALLOWED" });
    }
    if (url.pathname === "/auth/me") {
      return send(
        authenticated ? 200 : 401,
        authenticated ? AUTH : { code: "AUTHENTICATION_REQUIRED" },
      );
    }
    if (url.pathname === "/resources/" + PUBLIC_ID) {
      return send(200, { resource: mockResource(PUBLIC_ID, "public") });
    }
    if (url.pathname === "/resources/" + PRIVATE_ID) {
      if (!authenticated || blockedPrivate)
        return send(403, { code: "FORBIDDEN" });
      return send(200, { resource: mockResource(PRIVATE_ID, "private") });
    }
    return send(200, { items: [], nextCursor: null });
  });
  return {
    context,
    page: await context.newPage(),
    mutations: () => httpMutations,
  };
}

async function main() {
  let server;
  let browser;
  try {
    server = await bootWeb();
    browser = await chromium.launch({ headless: true });

    const guest = await mountContext(browser, false);
    await guest.page.goto(ORIGIN + "/resources/" + PUBLIC_ID, {
      waitUntil: "domcontentloaded",
    });
    await guest.page
      .getByRole("heading", { name: "Álgebra lineal: resumen" })
      .waitFor({ timeout: 15_000 });
    const publicCard = guest.page.locator(".resource-citation");
    assert.equal(
      await publicCard.locator("textarea").count(),
      0,
      "citation must remain collapsed and not copy on view",
    );
    await publicCard
      .getByRole("button", { name: "Preparar referencia" })
      .click();
    const publicReference = await publicCard.locator("textarea").inputValue();
    assert.match(publicReference, /Belén Suárez\. \(s\. f\.\)/u);
    assert.match(publicReference, /Álgebra I/u);
    assert.ok(
      publicReference.includes(ORIGIN + "/resources/" + PUBLIC_ID),
      "public citation should use first-party deep link only",
    );
    assert.equal(
      await guest.page.evaluate(() => navigator.clipboard.readText()),
      "",
      "citation must not copy without explicit user action",
    );
    await publicCard.getByRole("button", { name: "Copiar referencia" }).click();
    await publicCard
      .getByText("Referencia copiada.", { exact: false })
      .waitFor();
    const copiedPublicReference = await guest.page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    assert.equal(
      copiedPublicReference.replace(/\r\n/gu, "\n"),
      publicReference.replace(/\r\n/gu, "\n"),
    );
    assert.equal(guest.mutations(), 0);
    await guest.context.close();

    const member = await mountContext(browser, true);
    await member.page.goto(ORIGIN + "/resources/" + PRIVATE_ID, {
      waitUntil: "domcontentloaded",
    });
    await member.page
      .getByRole("heading", { name: "Apunte privado de examen" })
      .waitFor({ timeout: 15_000 });
    const privateCard = member.page.locator(".resource-citation");
    await privateCard
      .getByRole("button", { name: "Preparar referencia" })
      .click();
    const privateReference = await privateCard.locator("textarea").inputValue();
    assert.ok(privateReference.includes("Apunte privado de examen"));
    assert.ok(
      !privateReference.includes(PRIVATE_ID),
      "private ID must not be copied",
    );
    assert.ok(
      !privateReference.includes("/resources/"),
      "no restricted resource link",
    );
    await privateCard
      .getByText("El apunte no es público.", { exact: false })
      .waitFor();
    await privateCard
      .getByRole("button", { name: "Copiar referencia" })
      .click();
    await privateCard
      .getByText("Referencia copiada.", { exact: false })
      .waitFor();
    assert.equal(
      await member.page.evaluate(() => navigator.clipboard.readText()),
      privateReference,
    );
    assert.equal(member.mutations(), 0);
    await member.context.close();

    const revoked = await mountContext(browser, false);
    await revoked.page.goto(ORIGIN + "/resources/" + PRIVATE_ID, {
      waitUntil: "domcontentloaded",
    });
    await revoked.page
      .getByText("Este apunte ya no está disponible.", { exact: false })
      .waitFor({ timeout: 15_000 });
    assert.equal(await revoked.page.locator(".resource-citation").count(), 0);
    await revoked.context.close();

    console.log(
      "PASS B170 real Chromium: public explicit clipboard, nonpublic no URL, guest denied private, no mutation",
    );
  } finally {
    await browser?.close();
    await stopWeb(server);
  }
}
await main();
