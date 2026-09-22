import assert from 'node:assert/strict';

const baseUrl =
  process.env.LOSAPUNTES_SMOKE_BASE_URL ?? 'http://127.0.0.1:4000';

const REQUEST_TIMEOUT_MS = 5_000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requestJson(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.json();

  return { response, body };
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

console.log(
  JSON.stringify({
    event: 'runtime.smoke.ok',
    baseUrl,
    checks: ['liveness', 'readiness', 'request-id', 'error-envelope'],
  }),
);
