import assert from 'node:assert/strict';

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

  assert.notEqual(
    result.body,
    null,
    `${path} must return a JSON response body`,
  );
  assert.equal(
    typeof result.body,
    'object',
    `${path} must return JSON rather than plain text`,
  );

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

  assert.match(
    requestId ?? '',
    UUID_V4,
    'response must expose a server-generated UUID request id',
  );

  return requestId;
}

function cookiePair(setCookie) {
  assert.ok(setCookie, 'Web login must emit a Set-Cookie header');
  return setCookie.split(';', 1)[0];
}

const live = await requestJson('/health/live', {
  headers: {
    'x-request-id': 'client-controlled-request-id',
  },
});

assert.equal(live.response.status, 200);
assert.deepEqual(live.body, {
  status: 'ok',
  service: 'api',
});

const liveRequestId = assertRequestId(live.response);
assert.notEqual(
  liveRequestId,
  'client-controlled-request-id',
  'the API must not trust an inbound request id as authority',
);

const ready = await requestJson('/health/ready');

assert.equal(ready.response.status, 200);
assert.equal(ready.body.status, 'ready');
assert.equal(ready.body.service, 'api');
assert.deepEqual(ready.body.checks, [
  {
    name: 'mongo',
    status: 'ok',
    required: true,
  },
]);
assertRequestId(ready.response);

const missing = await requestJson('/__runtime_smoke_missing__');

assert.equal(missing.response.status, 404);
assert.equal(missing.body.statusCode, 404);
assert.equal(missing.body.code, 'NOT_FOUND');
assert.equal(missing.body.requestId, missing.response.headers.get('x-request-id'));
assertRequestId(missing.response);

const credentials = {
  email: 'runtime-smoke@example.test',
  password: 'runtime-smoke-credential-2026',
};

const registration = await requestJson(
  '/auth/register',
  jsonRequest('POST', credentials),
);

assert.equal(registration.response.status, 202);
assert.deepEqual(registration.body, { accepted: true });
assert.equal(
  JSON.stringify(registration.body).includes('sessionToken'),
  false,
  'registration must not issue an authenticated bearer',
);
assertRequestId(registration.response);

const webLogin = await requestJson(
  '/auth/login',
  jsonRequest('POST', credentials),
);

assert.equal(webLogin.response.status, 200);
assert.equal(webLogin.body.user.email, credentials.email);
assert.equal(webLogin.body.session.clientType, 'web');
assert.match(webLogin.body.session.id, UUID_V4);
assert.equal(
  Object.hasOwn(webLogin.body, 'sessionToken'),
  false,
  'Web login must never expose the raw session bearer in JSON',
);
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
assert.equal(
  /(?:^|;)\s*Domain=/i.test(setCookie ?? ''),
  false,
  'production Web session cookie must remain host-only',
);

const webCookie = cookiePair(setCookie);

const webMe = await requestJson('/auth/me', {
  headers: {
    cookie: webCookie,
  },
});

assert.equal(webMe.response.status, 200);
assert.equal(webMe.body.user.email, credentials.email);
assert.equal(webMe.body.session.id, webLogin.body.session.id);
assert.equal(webMe.body.session.current, true);
assertRequestId(webMe.response);

const csrfRejected = await requestJson('/auth/session', {
  method: 'DELETE',
  headers: {
    cookie: webCookie,
  },
});

assert.equal(csrfRejected.response.status, 403);
assert.equal(csrfRejected.body.code, 'CSRF_VALIDATION_FAILED');
assertRequestId(csrfRejected.response);

const webLogout = await request('/auth/session', {
  method: 'DELETE',
  headers: {
    cookie: webCookie,
    origin: WEB_ORIGIN,
  },
});

assert.equal(webLogout.response.status, 204);
assert.equal(webLogout.text, '');

const revokedWebMe = await requestJson('/auth/me', {
  headers: {
    cookie: webCookie,
  },
});

assert.equal(revokedWebMe.response.status, 401);
assert.equal(revokedWebMe.body.code, 'AUTHENTICATION_REQUIRED');
assertRequestId(revokedWebMe.response);

const mobileLogin = await requestJson(
  '/auth/mobile/login',
  jsonRequest('POST', credentials),
);

assert.equal(mobileLogin.response.status, 200);
assert.equal(mobileLogin.body.user.email, credentials.email);
assert.equal(mobileLogin.body.session.clientType, 'mobile');
assert.match(mobileLogin.body.session.id, UUID_V4);
assert.match(mobileLogin.body.sessionToken, SESSION_TOKEN);
assertRequestId(mobileLogin.response);

const bearer = `Bearer ${mobileLogin.body.sessionToken}`;

const mobileMe = await requestJson('/auth/me', {
  headers: {
    authorization: bearer,
  },
});

assert.equal(mobileMe.response.status, 200);
assert.equal(mobileMe.body.user.email, credentials.email);
assert.equal(mobileMe.body.session.id, mobileLogin.body.session.id);
assert.equal(mobileMe.body.session.clientType, 'mobile');
assertRequestId(mobileMe.response);

const sessionInventory = await requestJson('/auth/sessions', {
  headers: {
    authorization: bearer,
  },
});

assert.equal(sessionInventory.response.status, 200);
assert.ok(Array.isArray(sessionInventory.body.sessions));
assert.equal(sessionInventory.body.sessions.length, 1);
assert.deepEqual(
  sessionInventory.body.sessions[0],
  mobileLogin.body.session,
);
const inventoryJson = JSON.stringify(sessionInventory.body);
assert.equal(inventoryJson.includes('sessionToken'), false);
assert.equal(inventoryJson.includes('tokenHash'), false);
assertRequestId(sessionInventory.response);

const revokeAll = await request('/auth/sessions', {
  method: 'DELETE',
  headers: {
    authorization: bearer,
  },
});

assert.equal(revokeAll.response.status, 204);
assert.equal(revokeAll.text, '');

const revokedMobileMe = await requestJson('/auth/me', {
  headers: {
    authorization: bearer,
  },
});

assert.equal(revokedMobileMe.response.status, 401);
assert.equal(revokedMobileMe.body.code, 'AUTHENTICATION_REQUIRED');
assertRequestId(revokedMobileMe.response);

console.log(
  JSON.stringify({
    event: 'runtime.smoke.ok',
    baseUrl,
    checks: [
      'liveness',
      'readiness',
      'request-id',
      'error-envelope',
      'auth-registration',
      'auth-web-session',
      'auth-csrf',
      'auth-revocation',
      'auth-mobile-session',
      'auth-session-inventory',
    ],
  }),
);
