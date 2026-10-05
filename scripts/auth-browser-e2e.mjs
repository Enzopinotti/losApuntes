import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  extractActionToken,
  waitForMail,
  waitForMailpit,
} from "./mailpit-smoke.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ROOT = resolve(ROOT, "apps/web");
const WEB_ORIGIN = loopbackOrigin(
  "LOSAPUNTES_BROWSER_E2E_WEB_ORIGIN",
  "http://localhost:5173",
);
const API_ORIGIN = loopbackOrigin(
  "LOSAPUNTES_BROWSER_E2E_API_ORIGIN",
  "http://localhost:4000",
);
const REQUEST_TIMEOUT_MS = 5_000;
const WEB_START_TIMEOUT_MS = 30_000;
const EMAIL_SUBJECT = "Verificá tu email en Los Apuntes";

function loopbackOrigin(name, fallback) {
  const configured = process.env[name] ?? fallback;
  const url = new URL(configured);
  const hostname = url.hostname.toLowerCase();

  assert.equal(url.protocol, "http:", `${name} must use local HTTP`);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname),
    `${name} must target a loopback host`,
  );
  assert.equal(url.username, "", `${name} must not contain credentials`);
  assert.equal(url.password, "", `${name} must not contain credentials`);
  assert.equal(url.pathname, "/", `${name} must be an origin, not a path`);
  assert.equal(url.search, "", `${name} must not contain a query`);
  assert.equal(url.hash, "", `${name} must not contain a fragment`);

  return url.origin;
}

async function requestJson(path, options = {}) {
  const response = await fetch(new URL(path, API_ORIGIN), {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { response, body };
}

function jsonPost(body) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function startWebServer() {
  const viteCli = resolve(WEB_ROOT, "node_modules/vite/bin/vite.js");
  const webUrl = new URL(WEB_ORIGIN);
  const child = spawn(
    process.execPath,
    [
      viteCli,
      "--host",
      "0.0.0.0",
      "--port",
      webUrl.port || "80",
      "--strictPort",
    ],
    {
      cwd: WEB_ROOT,
      env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  let output = "";
  let spawnError;
  let exited = false;
  child.stdout.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-4_000);
  });
  child.stderr.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-4_000);
  });
  child.on("error", (error) => {
    spawnError = error;
  });
  child.on("exit", () => {
    exited = true;
  });

  return {
    child,
    getOutput: () => output,
    getSpawnError: () => spawnError,
    isExited: () => exited,
  };
}

async function waitForWebServer(server) {
  const deadline = Date.now() + WEB_START_TIMEOUT_MS;
  let lastError;

  while (Date.now() < deadline) {
    if (server.getSpawnError()) {
      throw server.getSpawnError();
    }
    if (server.isExited()) {
      throw new Error(`Web dev server exited early:\n${server.getOutput()}`);
    }

    try {
      const response = await fetch(new URL("/login", WEB_ORIGIN), {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
      lastError = new Error(`Web dev server returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(
    `Web dev server did not become ready: ${String(lastError)}\n${server.getOutput()}`,
  );
}

async function stopWebServer(server) {
  if (server.isExited()) return;

  let exited = false;
  const exit = new Promise((resolveExit) => {
    server.child.once("exit", () => {
      exited = true;
      resolveExit();
    });
  });

  server.child.kill("SIGTERM");
  await Promise.race([exit, delay(3_000)]);

  if (!exited) {
    server.child.kill("SIGKILL");
    await Promise.race([exit, delay(1_000)]);
  }
}

async function authenticatedMe(page) {
  return page.evaluate(async (apiOrigin) => {
    const response = await fetch(`${apiOrigin}/auth/me`, {
      credentials: "include",
      cache: "no-store",
    });
    let body;

    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    return { status: response.status, body };
  }, API_ORIGIN);
}

async function run() {
  const health = await fetch(new URL("/health/ready", API_ORIGIN), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  assert.equal(health.status, 200, "local Compose API must be ready");
  await waitForMailpit();

  const server = startWebServer();
  let browser;

  try {
    await waitForWebServer(server);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ forcedColors: "active" });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const email = `auth-browser-${randomUUID()}@example.test`;
    const password = `Browser-${randomBytes(24).toString("base64url")}!9a`;

    const registration = await requestJson(
      "/auth/register",
      jsonPost({ email, password }),
    );
    assert.equal(
      registration.response.status,
      202,
      "registration should be accepted",
    );
    assert.deepEqual(registration.body, { accepted: true });

    const verificationMail = await waitForMail(email, EMAIL_SUBJECT);
    const verificationToken = extractActionToken(
      verificationMail,
      "/auth/verify-email",
    );
    const verificationMailBody = [
      typeof verificationMail.Text === "string" ? verificationMail.Text : "",
      typeof verificationMail.HTML === "string" ? verificationMail.HTML : "",
    ].join("\n");
    assert.equal(
      verificationMailBody.includes(
        `/auth/verify-email#token=${verificationToken}`,
      ),
      true,
      "verification email should keep the one-time token in the URL fragment",
    );

    let verificationTokenAppearedInRequestUrl = false;
    page.on("request", (request) => {
      if (request.url().includes(verificationToken)) {
        verificationTokenAppearedInRequestUrl = true;
      }
    });

    try {
      await page.goto(
        new URL(
          `/auth/verify-email#token=${verificationToken}`,
          WEB_ORIGIN,
        ).toString(),
      );
    } catch {
      throw new Error(
        "Browser could not open the local email-verification link",
      );
    }
    await page.waitForFunction(
      () =>
        window.location.pathname === "/auth/verify-email" &&
        window.location.search === "" &&
        window.location.hash === "",
    );
    await page
      .getByText("Email verificado correctamente.", { exact: true })
      .waitFor();
    assert.equal(
      verificationTokenAppearedInRequestUrl,
      false,
      "one-time verification token must not appear in any browser request URL",
    );
    assert.equal(
      new URL(page.url()).hash,
      "",
      "verified action token should be absent from the address bar",
    );

    await page.getByRole("link", { name: "Iniciar sesión" }).click();
    await page.waitForURL((url) => url.pathname === "/login");
    await page.goBack();
    await page.waitForFunction(
      () =>
        window.location.pathname === "/auth/verify-email" &&
        window.location.search === "" &&
        window.location.hash === "",
    );
    assert.equal(
      page.url().includes(verificationToken),
      false,
      "browser history must not restore the one-time verification token",
    );

    await page.goto(new URL("/login", WEB_ORIGIN).toString());
    const loginEmail = page.getByLabel("Email");
    const loginPassword = page.getByLabel("Contraseña");
    const loginSubmit = page.getByRole("button", { name: "Iniciar sesión" });
    assert.equal(await loginEmail.getAttribute("autocomplete"), "email");
    assert.equal(
      await loginPassword.getAttribute("autocomplete"),
      "current-password",
    );
    assert.equal(
      await page.evaluate(
        () => window.matchMedia("(forced-colors: active)").matches,
      ),
      true,
      "Chromium should exercise the browser's forced-colors mode",
    );

    await page.goto(new URL("/sign-up", WEB_ORIGIN).toString());
    assert.equal(
      await page.getByLabel("Email").getAttribute("autocomplete"),
      "email",
    );
    assert.equal(
      await page
        .getByLabel("Contraseña", { exact: true })
        .getAttribute("autocomplete"),
      "new-password",
    );
    assert.equal(
      await page
        .getByLabel("Confirmar contraseña")
        .getAttribute("autocomplete"),
      "new-password",
    );

    await page.goto(new URL("/login", WEB_ORIGIN).toString());
    await page.getByRole("link", { name: "Olvidé mi contraseña" }).click();
    await page.waitForURL((url) => url.pathname === "/forgot-password");
    assert.equal(
      await page.getByLabel("Email").getAttribute("autocomplete"),
      "email",
    );
    await page.getByRole("link", { name: "Volver a iniciar sesión" }).click();
    await page.waitForURL((url) => url.pathname === "/login");

    await loginEmail.focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await loginPassword.evaluate(
        (element) => document.activeElement === element,
      ),
      true,
      "Tab should move focus from email to password",
    );
    const focusedPassword = await loginPassword.evaluate((element) => {
      const style = window.getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        insideViewport:
          bounds.left >= 0 &&
          bounds.top >= 0 &&
          bounds.right <= window.innerWidth &&
          bounds.bottom <= window.innerHeight,
      };
    });
    assert.equal(focusedPassword.focusVisible, true);
    assert.equal(focusedPassword.outlineStyle, "solid");
    assert.equal(focusedPassword.outlineWidth, "3px");
    assert.equal(
      focusedPassword.insideViewport,
      true,
      "password input should remain visible in the constrained viewport",
    );

    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await loginEmail.evaluate(
        (element) => document.activeElement === element,
      ),
      true,
    );
    await page.keyboard.type(email);
    await page.keyboard.press("Tab");
    await page.keyboard.type(password);
    await page.keyboard.press("Tab");
    assert.equal(
      await loginSubmit.evaluate(
        (element) => document.activeElement === element,
      ),
      true,
      "keyboard traversal should reach the login action",
    );

    const loginResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      return (
        new URL(response.url()).pathname === "/auth/login" &&
        request.method() === "POST"
      );
    });
    await page.keyboard.press("Enter");
    const loginResponse = await loginResponsePromise;
    assert.equal(loginResponse.status(), 200, "Web login should succeed");
    const loginSnapshot = await loginResponse.json();
    assert.equal(
      Object.hasOwn(loginSnapshot, "sessionToken"),
      false,
      "Web login must not return the session bearer to JavaScript",
    );

    await page.waitForURL((url) => url.pathname === "/dashboard");
    await page
      .getByRole("heading", { name: "Tu espacio en Los Apuntes" })
      .waitFor();

    const cookies = await context.cookies(API_ORIGIN);
    const sessionCookie = cookies.find((cookie) =>
      /^(__Host-)?losapuntes_session$/.test(cookie.name),
    );
    assert.ok(sessionCookie, "Web login should set its session cookie");
    assert.equal(
      sessionCookie.httpOnly,
      true,
      "session cookie must be HttpOnly",
    );
    assert.equal(
      sessionCookie.secure,
      true,
      "Compose runtime cookie must be Secure",
    );
    assert.equal(
      sessionCookie.sameSite,
      "Lax",
      "session cookie must use SameSite=Lax",
    );
    assert.equal(
      sessionCookie.path,
      "/",
      "session cookie must be scoped to the host",
    );

    const pageCookie = await page.evaluate(() => document.cookie);
    assert.equal(
      pageCookie.includes(sessionCookie.name),
      false,
      "page JavaScript must not read the session cookie",
    );

    const me = await authenticatedMe(page);
    assert.equal(
      me.status,
      200,
      "cookie-backed /auth/me should be authenticated",
    );
    assert.equal(me.body?.user?.email, email);
    assert.equal(
      Object.hasOwn(me.body ?? {}, "sessionToken"),
      false,
      "/auth/me must not return a session bearer",
    );

    const csrfResponse = await fetch(new URL("/auth/session", API_ORIGIN), {
      method: "DELETE",
      headers: {
        Cookie: `${sessionCookie.name}=${sessionCookie.value}`,
        Origin: "http://attacker.invalid",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const csrfBody = await csrfResponse.json();
    assert.equal(
      csrfResponse.status,
      403,
      "untrusted Origin must not revoke the session",
    );
    assert.equal(csrfBody.code, "CSRF_VALIDATION_FAILED");
    assert.equal(
      (await authenticatedMe(page)).status,
      200,
      "CSRF rejection must preserve session",
    );

    const logoutResponsePromise = page.waitForResponse((response) => {
      return (
        new URL(response.url()).pathname === "/auth/session" &&
        response.request().method() === "DELETE"
      );
    });
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    const logoutResponse = await logoutResponsePromise;
    assert.equal(
      logoutResponse.status(),
      204,
      "Web logout should revoke the session",
    );
    await page.waitForURL((url) => url.pathname === "/login");

    const cookiesAfterLogout = await context.cookies(API_ORIGIN);
    assert.equal(
      cookiesAfterLogout.some((cookie) => cookie.name === sessionCookie.name),
      false,
      "logout should clear the session cookie",
    );
    const anonymousMe = await authenticatedMe(page);
    assert.equal(
      anonymousMe.status,
      401,
      "revoked session must no longer authorize /auth/me",
    );
    assert.deepEqual(
      pageErrors,
      [],
      "auth journey should not produce uncaught page errors",
    );

    await context.close();
    console.log(
      "Auth browser E2E passed: verification URL/history scrubbing, keyboard/autofill, HttpOnly login, /auth/me, CSRF rejection and logout.",
    );
  } finally {
    await browser?.close();
    await stopWebServer(server);
  }
}

await run();
