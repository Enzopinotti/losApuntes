import assert from 'node:assert/strict';

const REQUEST_TIMEOUT_MS = 15_000;

function required(name, maximumLength = 4096) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (value.length > maximumLength) {
    throw new Error(`${name} exceeds its maximum accepted length`);
  }
  return value;
}

function nonProductionTarget() {
  const value = required('RESTORE_API_TARGET_ENV', 64);
  const normalized = value.toLowerCase();
  if (
    ['prod', 'production', 'prd', 'live', 'public'].includes(normalized) ||
    normalized.includes('production')
  ) {
    throw new Error('restore API smoke refuses production targets');
  }
  return value;
}

function apiOrigin() {
  const raw = required('RESTORE_API_BASE_URL', 2048);
  const url = new URL(raw);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error('RESTORE_API_BASE_URL must be an HTTP(S) root origin');
  }
  return url;
}

async function requestJson(origin, pathname, bearer, init = {}) {
  const response = await fetch(new URL(pathname, origin), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(bearer ? { Authorization: bearer } : {}),
      ...init.headers,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body = null;
  if (text) body = JSON.parse(text);
  return { response, body };
}

async function main() {
  const targetEnvironment = nonProductionTarget();
  const origin = apiOrigin();
  const bearer = required('RESTORE_API_BEARER');
  const resourceId = required('RESTORE_SAMPLE_RESOURCE_ID', 64);

  const ready = await requestJson(origin, '/health/ready');
  assert.equal(ready.response.status, 200);
  assert.equal(ready.body?.status, 'ready');

  const resource = await requestJson(
    origin,
    `/resources/${encodeURIComponent(resourceId)}`,
    bearer,
  );
  assert.equal(resource.response.status, 200);
  assert.equal(resource.body?.resource?.id ?? resource.body?.id, resourceId);

  const file =
    resource.body?.resource?.file ??
    resource.body?.file;
  assert.equal(typeof file?.byteSize, 'number');
  assert.equal(typeof file?.mimeType, 'string');

  const access = await requestJson(
    origin,
    `/resources/${encodeURIComponent(resourceId)}/access`,
    bearer,
    {
      method: 'POST',
      body: JSON.stringify({ disposition: 'attachment' }),
    },
  );
  assert.equal(access.response.status, 201);
  assert.equal(access.response.headers.get('cache-control'), 'no-store');
  assert.equal(typeof access.body?.access?.url, 'string');

  const bytesResponse = await fetch(access.body.access.url, {
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  assert.equal(bytesResponse.ok, true);
  const bytes = await bytesResponse.arrayBuffer();
  assert.equal(bytes.byteLength, file.byteSize);
  assert.equal(
    bytesResponse.headers.get('content-type')?.split(';', 1)[0],
    file.mimeType,
  );

  console.log(
    JSON.stringify({
      event: 'recovery.api.smoke',
      status: 'PASS',
      targetEnvironment,
      resourceChecked: true,
      signedDownloadChecked: true,
      byteSize: bytes.byteLength,
    }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'recovery.api.smoke',
      status: 'HOLD',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 2;
});
