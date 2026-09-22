import assert from 'node:assert/strict';

import {
  extractActionToken,
  waitForMail,
  waitForMailpit,
} from './mailpit-smoke.mjs';

const baseUrl =
  process.env.LOSAPUNTES_SMOKE_BASE_URL ?? 'http://127.0.0.1:4000';

const REQUEST_TIMEOUT_MS = 5_000;
const WEB_ORIGIN = 'http://localhost:5173';
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

async function request(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body = null;

  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { response, body, text };
}

async function requestJson(path, options = {}) {
  const result = await request(path, options);

  assert.notEqual(result.body, null, `${path} must return JSON`);
  assert.equal(typeof result.body, 'object', `${path} must return JSON`);

  return result;
}

function jsonRequest(method, body, headers = {}) {
  return {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function assertRequestId(response) {
  const requestId = response.headers.get('x-request-id');

  assert.match(requestId ?? '', UUID_V4);
  return requestId;
}

function cookiePair(setCookie) {
  assert.ok(setCookie, 'Web login must emit Set-Cookie');
  return setCookie.split(';', 1)[0];
}

await waitForMailpit();

const credentials = {
  email: 'runtime-smoke@example.test',
  password: 'runtime-smoke-credential-2026',
};
const newPassword = 'runtime-smoke-new-credential-2026';

const registration = await requestJson(
  '/auth/register',
  jsonRequest('POST', credentials),
);

assert.equal(registration.response.status, 202);
assert.deepEqual(registration.body, { accepted: true });
assert.equal(Object.hasOwn(registration.body, 'sessionToken'), false);
assertRequestId(registration.response);

const wrongPassword = await requestJson(
  '/auth/login',
  jsonRequest('POST', {
    ...credentials,
    password: 'wrong-runtime-smoke-password',
  }),
);

assert.equal(wrongPassword.response.status, 401);
assert.equal(wrongPassword.body.code, 'INVALID_CREDENTIALS');
assertRequestId(wrongPassword.response);

const unverifiedLogin = await requestJson(
  '/auth/login',
  jsonRequest('POST', credentials),
);

assert.equal(unverifiedLogin.response.status, 403);
assert.equal(unverifiedLogin.body.code, 'EMAIL_VERIFICATION_REQUIRED');
assertRequestId(unverifiedLogin.response);

const verificationMail = await waitForMail(
  credentials.email,
  'Verificá tu email en Los Apuntes',
);
const verificationToken = extractActionToken(
  verificationMail,
  '/auth/verify-email',
);

const verificationInspect = await requestJson(
  '/auth/email-verification/inspect',
  jsonRequest('POST', { token: verificationToken }),
);

assert.equal(verificationInspect.response.status, 200);
assert.deepEqual(verificationInspect.body, {
  verification: { available: true },
});
assertRequestId(verificationInspect.response);

const verificationComplete = await request(
  '/auth/email-verification/complete',
  jsonRequest('POST', { token: verificationToken }),
);

assert.equal(verificationComplete.response.status, 204);
assert.equal(verificationComplete.text, '');

const verificationReplay = await requestJson(
  '/auth/email-verification/complete',
  jsonRequest('POST', { token: verificationToken }),
);

assert.equal(verificationReplay.response.status, 410);
assert.equal(
  verificationReplay.body.code,
  'VERIFICATION_NOT_AVAILABLE',
);
assertRequestId(verificationReplay.response);

const webLogin = await requestJson(
  '/auth/login',
  jsonRequest('POST', credentials),
);

assert.equal(webLogin.response.status, 200);
assert.equal(webLogin.body.user.email, credentials.email);
assert.equal(webLogin.body.session.clientType, 'web');
assert.match(webLogin.body.session.id, UUID_V4);
assert.equal(Object.hasOwn(webLogin.body, 'sessionToken'), false);
assertRequestId(webLogin.response);

const setCookie = webLogin.response.headers.get('set-cookie');
assert.match(
  setCookie ?? '',
  /^__Host-losapuntes_session=[A-Za-z0-9_-]{43};/i,
);
assert.match(setCookie ?? '', /(?:^|;)\s*Path=\//i);
assert.match(setCookie ?? '', /(?:^|;)\s*HttpOnly(?:;|$)/i);
assert.match(setCookie ?? '', /(?:^|;)\s*Secure(?:;|$)/i);
assert.match(setCookie ?? '', /(?:^|;)\s*SameSite=Lax(?:;|$)/i);
assert.equal(/(?:^|;)\s*Domain=/i.test(setCookie ?? ''), false);

const webCookie = cookiePair(setCookie);

const webMe = await requestJson('/auth/me', {
  headers: { cookie: webCookie },
});

assert.equal(webMe.response.status, 200);
assert.equal(webMe.body.session.id, webLogin.body.session.id);
assertRequestId(webMe.response);

const csrfRejected = await requestJson('/auth/session', {
  method: 'DELETE',
  headers: { cookie: webCookie },
});

assert.equal(csrfRejected.response.status, 403);
assert.equal(csrfRejected.body.code, 'CSRF_VALIDATION_FAILED');
assertRequestId(csrfRejected.response);

const mobileLogin = await requestJson(
  '/auth/mobile/login',
  jsonRequest('POST', credentials),
);

assert.equal(mobileLogin.response.status, 200);
assert.equal(mobileLogin.body.session.clientType, 'mobile');
assert.match(mobileLogin.body.session.id, UUID_V4);
assert.match(mobileLogin.body.sessionToken, SESSION_TOKEN);
assertRequestId(mobileLogin.response);

const mobileBearer = `Bearer ${mobileLogin.body.sessionToken}`;

const mobileMe = await requestJson('/auth/me', {
  headers: { authorization: mobileBearer },
});

assert.equal(mobileMe.response.status, 200);
assert.equal(mobileMe.body.session.id, mobileLogin.body.session.id);
assertRequestId(mobileMe.response);

const inventory = await requestJson('/auth/sessions', {
  headers: { authorization: mobileBearer },
});

assert.equal(inventory.response.status, 200);
assert.equal(inventory.body.sessions.length, 2);
assert.equal(
  inventory.body.sessions.some(
    (session) => session.id === webLogin.body.session.id,
  ),
  true,
);
assert.equal(
  inventory.body.sessions.some(
    (session) =>
      session.id === mobileLogin.body.session.id && session.current === true,
  ),
  true,
);
const inventoryJson = JSON.stringify(inventory.body);
assert.equal(inventoryJson.includes('sessionToken'), false);
assert.equal(inventoryJson.includes('tokenHash'), false);
assertRequestId(inventory.response);

const missingRecovery = await requestJson(
  '/auth/password/recovery/request',
  jsonRequest('POST', { email: 'missing-runtime-smoke@example.test' }),
);

assert.equal(missingRecovery.response.status, 202);
assert.deepEqual(missingRecovery.body, { accepted: true });
assertRequestId(missingRecovery.response);

const recoveryRequest = await requestJson(
  '/auth/password/recovery/request',
  jsonRequest('POST', { email: credentials.email }),
);

assert.equal(recoveryRequest.response.status, 202);
assert.deepEqual(recoveryRequest.body, { accepted: true });
assertRequestId(recoveryRequest.response);

const recoveryMail = await waitForMail(
  credentials.email,
  'Recuperá tu acceso a Los Apuntes',
);
const recoveryToken = extractActionToken(
  recoveryMail,
  '/auth/reset-password',
);

const recoveryInspect = await requestJson(
  '/auth/password/recovery/inspect',
  jsonRequest('POST', { token: recoveryToken }),
);

assert.equal(recoveryInspect.response.status, 200);
assert.deepEqual(recoveryInspect.body, {
  recovery: { available: true },
});
assertRequestId(recoveryInspect.response);

const recoveryComplete = await request(
  '/auth/password/recovery/complete',
  jsonRequest('POST', {
    token: recoveryToken,
    newPassword,
  }),
);

assert.equal(recoveryComplete.response.status, 204);
assert.equal(recoveryComplete.text, '');

const recoveryReplay = await requestJson(
  '/auth/password/recovery/complete',
  jsonRequest('POST', {
    token: recoveryToken,
    newPassword: 'another-valid-runtime-password',
  }),
);

assert.equal(recoveryReplay.response.status, 410);
assert.equal(recoveryReplay.body.code, 'RECOVERY_NOT_AVAILABLE');
assertRequestId(recoveryReplay.response);

const staleWebMe = await requestJson('/auth/me', {
  headers: { cookie: webCookie },
});
assert.equal(staleWebMe.response.status, 401);
assert.equal(staleWebMe.body.code, 'AUTHENTICATION_REQUIRED');

const staleMobileMe = await requestJson('/auth/me', {
  headers: { authorization: mobileBearer },
});
assert.equal(staleMobileMe.response.status, 401);
assert.equal(staleMobileMe.body.code, 'AUTHENTICATION_REQUIRED');

const oldPasswordLogin = await requestJson(
  '/auth/mobile/login',
  jsonRequest('POST', credentials),
);
assert.equal(oldPasswordLogin.response.status, 401);
assert.equal(oldPasswordLogin.body.code, 'INVALID_CREDENTIALS');

const newMobileLogin = await requestJson(
  '/auth/mobile/login',
  jsonRequest('POST', {
    email: credentials.email,
    password: newPassword,
  }),
);

assert.equal(newMobileLogin.response.status, 200);
assert.match(newMobileLogin.body.sessionToken, SESSION_TOKEN);
assert.equal(newMobileLogin.body.session.clientType, 'mobile');

await waitForMail(
  credentials.email,
  'Tu contraseña de Los Apuntes fue actualizada',
);

const finalRevoke = await request('/auth/sessions', {
  method: 'DELETE',
  headers: {
    authorization: `Bearer ${newMobileLogin.body.sessionToken}`,
  },
});

assert.equal(finalRevoke.response.status, 204);
assert.equal(finalRevoke.text, '');

console.log(
  JSON.stringify({
    event: 'auth.lifecycle.smoke.ok',
    baseUrl,
    checks: [
      'registration-bounded',
      'verification-gated-login',
      'verification-email',
      'verification-one-time',
      'web-session',
      'csrf',
      'mobile-session',
      'session-inventory',
      'recovery-enumeration-bounded',
      'recovery-email',
      'recovery-one-time',
      'credential-version-fencing',
      'old-password-invalidated',
      'new-password-login',
      'recovery-confirmation-email',
    ],
  }),
);
