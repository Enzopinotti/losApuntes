import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
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
const RECOVERY_EMAIL_SUBJECT = "Recuperá tu acceso a Los Apuntes";

function validateLoopbackOrigin(name, value) {
  const url = new URL(value);
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

function loopbackOrigin(name, fallback) {
  return validateLoopbackOrigin(name, process.env[name] ?? fallback);
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

function setSyntheticAccountStatus(email, status) {
  const script = [
    "const result = db.users.updateOne(",
    `  { email: ${JSON.stringify(email)} },`,
    `  { $set: { account_status: ${JSON.stringify(status)} } },`,
    ");",
    "if (result.matchedCount !== 1) {",
    "  printjson(result);",
    "  quit(2);",
    "}",
  ].join("\n");

  execFileSync(
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
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function expireSyntheticSession(sessionId) {
  const script = [
    "const result = db.auth_sessions.updateOne(",
    `  { sessionId: ${JSON.stringify(sessionId)} },`,
    "  { $set: { expiresAt: new Date(Date.now() - 1000) } },",
    ");",
    "if (result.matchedCount !== 1) {",
    "  printjson(result);",
    "  quit(2);",
    "}",
  ].join("\n");

  execFileSync(
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
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function assertExpiredSyntheticSessionStillPresent(sessionId) {
  // A missing session also returns 401. Verify Mongo's TTL monitor has not
  // removed the fixture, so this test proves the application expiry predicate.
  const script = [
    `const session = db.auth_sessions.findOne({ sessionId: ${JSON.stringify(sessionId)} });`,
    "if (!session || !(session.expiresAt instanceof Date) || session.expiresAt.getTime() >= Date.now()) {",
    '  throw new Error("Synthetic Auth session must still exist and be expired");',
    "}",
  ].join("\\n");

  execFileSync(
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
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
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
    const verificationUrl = (
      verificationMailBody.match(/https?:\/\/[^\s"'<>]+/g) ?? []
    )
      .map((candidate) => candidate.replace(/[),.;\]]+$/, ""))
      .map((candidate) => {
        try {
          return new URL(candidate);
        } catch {
          return undefined;
        }
      })
      .find(
        (candidate) =>
          candidate?.pathname === "/auth/verify-email" &&
          candidate.hash === `#token=${verificationToken}`,
      );
    assert.equal(
      verificationUrl instanceof URL,
      true,
      "verification email should contain a complete fragment-based browser URL",
    );
    const verificationOrigin = validateLoopbackOrigin(
      "captured verification link origin",
      verificationUrl.origin,
    );
    assert.equal(
      verificationOrigin,
      WEB_ORIGIN,
      "verification email should target the configured local Web origin",
    );
    assert.equal(
      verificationUrl.search,
      "",
      "verification email should not put the one-time token in the query",
    );

    let verificationTokenAppearedInRequestUrl = false;
    page.on("request", (request) => {
      if (request.url().includes(verificationToken)) {
        verificationTokenAppearedInRequestUrl = true;
      }
    });

    try {
      await page.goto(verificationUrl.toString());
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
    await page
      .getByRole("heading", { name: "Recuperar contraseña", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Email").getAttribute("autocomplete"),
      "email",
    );
    await page.getByRole("link", { name: "Volver a iniciar sesión" }).click();
    await page.waitForURL((url) => url.pathname === "/login");
    await page
      .getByRole("heading", {
        name: "Inicia sesión en tu cuenta",
        exact: true,
      })
      .waitFor();

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

    await page.goto(new URL("/forgot-password", WEB_ORIGIN).toString());
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Enviar instrucciones" }).click();
    await page
      .getByText(
        "Si existe una cuenta que puede recuperarse, te enviamos instrucciones.",
        { exact: true },
      )
      .waitFor();

    const recoveryMail = await waitForMail(email, RECOVERY_EMAIL_SUBJECT);
    const recoveryToken = extractActionToken(
      recoveryMail,
      "/auth/reset-password",
    );
    const recoveryMailBody = [
      typeof recoveryMail.Text === "string" ? recoveryMail.Text : "",
      typeof recoveryMail.HTML === "string" ? recoveryMail.HTML : "",
    ].join("\n");
    const recoveryUrl = (
      recoveryMailBody.match(/https?:\/\/[^\s"'<>]+/g) ?? []
    )
      .map((candidate) => candidate.replace(/[),.;\]]+$/, ""))
      .map((candidate) => {
        try {
          return new URL(candidate);
        } catch {
          return undefined;
        }
      })
      .find(
        (candidate) =>
          candidate?.pathname === "/auth/reset-password" &&
          candidate.hash === `#token=${recoveryToken}`,
      );
    assert.equal(
      recoveryUrl instanceof URL,
      true,
      "recovery email should contain a complete fragment-based browser URL",
    );
    const recoveryOrigin = validateLoopbackOrigin(
      "captured recovery link origin",
      recoveryUrl.origin,
    );
    assert.equal(
      recoveryOrigin,
      WEB_ORIGIN,
      "recovery email should target the configured local Web origin",
    );
    assert.equal(
      recoveryUrl.search,
      "",
      "recovery email should not put the one-time token in the query",
    );

    let recoveryTokenAppearedInRequestUrl = false;
    page.on("request", (request) => {
      if (request.url().includes(recoveryToken)) {
        recoveryTokenAppearedInRequestUrl = true;
      }
    });

    await page.goto(recoveryUrl.toString());
    await page.waitForFunction(
      () =>
        window.location.pathname === "/auth/reset-password" &&
        window.location.search === "" &&
        window.location.hash === "",
    );
    await page
      .getByRole("heading", {
        name: "Elegí una nueva contraseña",
        exact: true,
      })
      .waitFor();
    const resetPassword = page.getByLabel("Nueva contraseña", { exact: true });
    const resetPasswordConfirmation = page.getByLabel("Confirmar contraseña", {
      exact: true,
    });
    await resetPassword.waitFor();
    assert.equal(
      await resetPassword.getAttribute("autocomplete"),
      "new-password",
    );
    assert.equal(
      await resetPasswordConfirmation.getAttribute("autocomplete"),
      "new-password",
    );

    const recoveredPassword =
      `Recovered-${randomBytes(24).toString("base64url")}!7b`;
    await resetPassword.fill(recoveredPassword);
    await resetPasswordConfirmation.fill(recoveredPassword);
    const recoveryCompleteResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      return (
        new URL(response.url()).pathname ===
          "/auth/password/recovery/complete" &&
        request.method() === "POST"
      );
    });
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    const recoveryCompleteResponse = await recoveryCompleteResponsePromise;
    assert.equal(
      recoveryCompleteResponse.status(),
      204,
      "browser password recovery should succeed",
    );
    await page
      .getByText(
        "Contraseña actualizada. Cerramos las sesiones anteriores.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      recoveryTokenAppearedInRequestUrl,
      false,
      "one-time recovery token must not appear in any browser request URL",
    );
    assert.equal(
      page.url().includes(recoveryToken),
      false,
      "recovery token should be absent from the address bar after parsing",
    );

    await page.getByRole("link", { name: "Iniciar sesión de nuevo" }).click();
    await page.waitForURL((url) => url.pathname === "/login");
    await page.goBack();
    await page.waitForFunction(
      () =>
        window.location.pathname === "/auth/reset-password" &&
        window.location.search === "" &&
        window.location.hash === "",
    );
    assert.equal(
      page.url().includes(recoveryToken),
      false,
      "browser history must not restore the one-time recovery token",
    );

    await page.goto(new URL("/login", WEB_ORIGIN).toString());
    const recoveredLoginEmail = page.getByLabel("Email");
    const recoveredLoginPassword = page.getByLabel("Contraseña");
    const recoveredLoginSubmit = page.getByRole("button", {
      name: "Iniciar sesión",
    });
    await recoveredLoginEmail.fill(email);
    await recoveredLoginPassword.fill(password);
    const stalePasswordResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      return (
        new URL(response.url()).pathname === "/auth/login" &&
        request.method() === "POST"
      );
    });
    await recoveredLoginSubmit.click();
    const stalePasswordResponse = await stalePasswordResponsePromise;
    assert.equal(
      stalePasswordResponse.status(),
      401,
      "old password should be rejected after recovery",
    );
    await page
      .getByText("Email o contraseña incorrectos.", { exact: true })
      .waitFor();

    await recoveredLoginPassword.fill(recoveredPassword);
    const recoveredLoginResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      return (
        new URL(response.url()).pathname === "/auth/login" &&
        request.method() === "POST"
      );
    });
    await recoveredLoginSubmit.click();
    const recoveredLoginResponse = await recoveredLoginResponsePromise;
    assert.equal(
      recoveredLoginResponse.status(),
      200,
      "new password should authenticate after recovery",
    );
    await page.waitForURL((url) => url.pathname === "/dashboard");
    assert.equal((await authenticatedMe(page)).status, 200);

    setSyntheticAccountStatus(email, "restricted");
    try {
      const restrictedRevalidationResponsePromise = page.waitForResponse(
        (response) => {
          const request = response.request();
          return (
            new URL(response.url()).pathname === "/auth/me" &&
            request.method() === "GET"
          );
        },
      );
      await page.reload();
      const restrictedRevalidationResponse =
        await restrictedRevalidationResponsePromise;
      assert.equal(
        restrictedRevalidationResponse.status(),
        403,
        "an existing session should observe account restriction on revalidation",
      );
      const restrictedRevalidationBody =
        await restrictedRevalidationResponse.json();
      assert.equal(
        restrictedRevalidationBody?.code,
        "ACCOUNT_RESTRICTED",
        "restricted revalidation should preserve the stable Auth error code",
      );
      await page.waitForURL((url) => url.pathname === "/account/restricted");
      await page
        .getByRole("heading", { name: "Acceso restringido", exact: true })
        .waitFor();

      await context.clearCookies();
      await page.goto(new URL("/login", WEB_ORIGIN).toString());
      const restrictedLoginEmail = page.getByLabel("Email", { exact: true });
      const restrictedLoginPassword = page.getByLabel("Contraseña", {
        exact: true,
      });
      await restrictedLoginEmail.fill(email);
      await restrictedLoginPassword.fill(recoveredPassword);

      const restrictedLoginResponsePromise = page.waitForResponse((response) => {
        const request = response.request();
        return (
          new URL(response.url()).pathname === "/auth/login" &&
          request.method() === "POST"
        );
      });
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      const restrictedLoginResponse = await restrictedLoginResponsePromise;
      assert.equal(
        restrictedLoginResponse.status(),
        403,
        "correct credentials for a restricted account should be rejected",
      );
      await page.waitForURL((url) => url.pathname === "/account/restricted");
      await page
        .getByRole("heading", { name: "Acceso restringido", exact: true })
        .waitFor();
    } finally {
      setSyntheticAccountStatus(email, "active");
    }

    await page.goto(new URL("/login", WEB_ORIGIN).toString());
    const revocationLoginEmail = page.getByLabel("Email", { exact: true });
    const revocationLoginPassword = page.getByLabel("Contraseña", {
      exact: true,
    });
    await revocationLoginEmail.fill(email);
    await revocationLoginPassword.fill(recoveredPassword);
    const revocationWebLoginResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      return (
        new URL(response.url()).pathname === "/auth/login" &&
        request.method() === "POST"
      );
    });
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    const revocationWebLoginResponse =
      await revocationWebLoginResponsePromise;
    assert.equal(
      revocationWebLoginResponse.status(),
      200,
      "browser login should succeed before remote session revocation",
    );
    await page.waitForURL((url) => url.pathname === "/dashboard");

    const revocationWebSnapshot = await authenticatedMe(page);
    assert.equal(revocationWebSnapshot.status, 200);
    const revocationWebSessionId = revocationWebSnapshot.body?.session?.id;
    assert.equal(
      typeof revocationWebSessionId,
      "string",
      "authenticated Web snapshot should expose a public session id",
    );

    const revokerLogin = await requestJson(
      "/auth/mobile/login",
      jsonPost({ email, password: recoveredPassword }),
    );
    assert.equal(
      revokerLogin.response.status,
      200,
      "secondary Mobile session should authenticate for remote revocation",
    );
    const revokerToken = revokerLogin.body?.sessionToken;
    assert.equal(
      typeof revokerToken,
      "string",
      "secondary Mobile login should return its bearer token",
    );
    const revokerAuthorization = `Bearer ${revokerToken}`;
    let revocationFlowError;

    try {
      const remoteRevocation = await requestJson(
        `/auth/sessions/${encodeURIComponent(revocationWebSessionId)}`,
        {
          method: "DELETE",
          headers: { authorization: revokerAuthorization },
        },
      );
      assert.equal(
        remoteRevocation.response.status,
        204,
        "secondary session should revoke the active Web session",
      );

      const revokedBootstrapResponsePromise = page.waitForResponse((response) => {
        const request = response.request();
        return (
          new URL(response.url()).pathname === "/auth/me" &&
          request.method() === "GET"
        );
      });
      await page.reload();
      const revokedBootstrapResponse = await revokedBootstrapResponsePromise;
      assert.equal(
        revokedBootstrapResponse.status(),
        401,
        "revoked Web session should fail the next Auth bootstrap",
      );
      const revokedBootstrapBody = await revokedBootstrapResponse.json();
      assert.equal(
        revokedBootstrapBody?.code,
        "AUTHENTICATION_REQUIRED",
        "revoked Web session should preserve the stable anonymous Auth code",
      );
      await page.waitForURL((url) => url.pathname === "/login");
      await page
        .getByRole("heading", { name: "Inicia sesión en tu cuenta", exact: true })
        .waitFor();

      assert.deepEqual(
        pageErrors,
        [],
        "auth journey should not produce uncaught page errors",
      );
    } catch (error) {
      revocationFlowError = error;
    } finally {
      try {
        const revokerLogout = await requestJson("/auth/session", {
          method: "DELETE",
          headers: { authorization: revokerAuthorization },
        });
        assert.equal(
          revokerLogout.response.status,
          204,
          "secondary Mobile revoker session should be cleaned up",
        );
      } catch (cleanupError) {
        if (revocationFlowError) {
          throw new AggregateError(
            [revocationFlowError, cleanupError],
            "remote Web-session revocation flow and revoker cleanup both failed",
          );
        }

        throw cleanupError;
      }
    }

    if (revocationFlowError) {
      throw revocationFlowError;
    }

    await page.goto(new URL("/login", WEB_ORIGIN).toString());
    const expiryLoginEmail = page.getByLabel("Email", { exact: true });
    const expiryLoginPassword = page.getByLabel("Contraseña", { exact: true });
    await expiryLoginEmail.fill(email);
    await expiryLoginPassword.fill(recoveredPassword);
    const expiryLoginResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      return (
        new URL(response.url()).pathname === "/auth/login" &&
        request.method() === "POST"
      );
    });
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    const expiryLoginResponse = await expiryLoginResponsePromise;
    assert.equal(
      expiryLoginResponse.status(),
      200,
      "browser login should succeed before synthetic absolute expiry",
    );
    await page.waitForURL((url) => url.pathname === "/dashboard");

    const expirySnapshot = await authenticatedMe(page);
    assert.equal(expirySnapshot.status, 200);
    const expiringSessionId = expirySnapshot.body?.session?.id;
    assert.equal(
      typeof expiringSessionId,
      "string",
      "authenticated Web snapshot should expose the expiring session id",
    );

    expireSyntheticSession(expiringSessionId);
    assertExpiredSyntheticSessionStillPresent(expiringSessionId);

    const expiredBootstrapResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      return (
        new URL(response.url()).pathname === "/auth/me" &&
        request.method() === "GET"
      );
    });
    await page.reload();
    const expiredBootstrapResponse = await expiredBootstrapResponsePromise;
    assert.equal(
      expiredBootstrapResponse.status(),
      401,
      "expired Web session should fail the next Auth bootstrap",
    );
    const expiredBootstrapBody = await expiredBootstrapResponse.json();
    assert.equal(
      expiredBootstrapBody?.code,
      "AUTHENTICATION_REQUIRED",
      "expired Web session should preserve the stable anonymous Auth code",
    );
    assertExpiredSyntheticSessionStillPresent(expiringSessionId);
    await page.waitForURL((url) => url.pathname === "/login");
    await page
      .getByRole("heading", { name: "Inicia sesión en tu cuenta", exact: true })
      .waitFor();

    assert.deepEqual(
      pageErrors,
      [],
      "auth journey should not produce uncaught page errors",
    );

    await context.close();
    console.log(
      "Auth browser E2E passed: verification/recovery URL and history scrubbing, keyboard/autofill, HttpOnly login, /auth/me, CSRF rejection, logout, recovered credential login, restricted-account routing, remote Web-session revocation and expired-session routing.",
    );
  } finally {
    await browser?.close();
    await stopWebServer(server);
  }
}

await run();
