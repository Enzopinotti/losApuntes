const RELEASE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const SOURCE_SHA_PATTERN = /^[a-f\d]{40}$/iu;
const HASHED_ASSET_PATTERN =
  /\/[A-Za-z0-9._/-]*-[A-Za-z0-9_-]{8,}\.(?:css|js|mjs|woff2?|png|jpe?g|gif|svg|webp|avif)$/iu;
const MAX_ASSETS = 32;
const DEFAULT_TIMEOUT_MS = 15_000;

export class ReleaseQualificationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ReleaseQualificationError';
    this.code = code;
  }
}

function fail(code) {
  throw new ReleaseQualificationError(code);
}

function exactSourceSha(value, code = 'INVALID_EXPECTED_SOURCE_SHA') {
  if (typeof value !== 'string' || !SOURCE_SHA_PATTERN.test(value.trim())) {
    fail(code);
  }
  return value.trim().toLowerCase();
}

function boundedReleaseId(value, code) {
  if (typeof value !== 'string' || !RELEASE_ID_PATTERN.test(value.trim())) {
    fail(code);
  }
  return value.trim();
}

export function normalizeProductionOrigin(value, code = 'INVALID_ORIGIN') {
  if (typeof value !== 'string' || value.trim() === '') fail(code);

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    fail(code);
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    fail(code);
  }

  return url.origin;
}

function directives(value) {
  if (typeof value !== 'string') return new Map();

  const parsed = new Map();
  for (const part of value.split(',')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    const name = rawName?.trim().toLowerCase();
    if (!name) continue;
    parsed.set(
      name,
      rawValue.length > 0
        ? rawValue.join('=').trim().replace(/^"|"$/gu, '')
        : true,
    );
  }
  return parsed;
}

export function assertRevalidatableCacheControl(value, code) {
  const parsed = directives(value);
  if (parsed.has('immutable')) fail(code);
  if (parsed.has('no-store') || parsed.has('no-cache')) return;

  const maxAge = parsed.get('max-age');
  if (
    maxAge === '0' &&
    parsed.has('must-revalidate')
  ) {
    return;
  }

  fail(code);
}

export function assertNoStoreCacheControl(value, code) {
  if (!directives(value).has('no-store')) fail(code);
}

export function assertImmutableAssetCacheControl(value, code) {
  const parsed = directives(value);
  const maxAge = Number(parsed.get('max-age'));

  if (
    !parsed.has('immutable') ||
    !Number.isSafeInteger(maxAge) ||
    maxAge < 86_400
  ) {
    fail(code);
  }
}

export function extractHashedAssetUrls(html, webOrigin) {
  if (typeof html !== 'string' || html.length === 0) {
    fail('WEB_SHELL_INVALID');
  }

  const urls = [];
  const seen = new Set();
  const references = html.matchAll(/(?:src|href)=["']([^"']+)["']/giu);

  for (const match of references) {
    const rawReference = match[1];
    let url;
    try {
      url = new URL(rawReference, webOrigin);
    } catch {
      continue;
    }

    if (
      url.origin !== webOrigin ||
      !url.pathname.startsWith('/assets/')
    ) {
      continue;
    }

    if (url.search || url.hash || !HASHED_ASSET_PATTERN.test(url.pathname)) {
      fail('WEB_ASSET_UNHASHED');
    }

    if (!seen.has(url.href)) {
      seen.add(url.href);
      urls.push(url.href);
    }

    if (urls.length > MAX_ASSETS) {
      fail('WEB_ASSET_BUDGET_EXCEEDED');
    }
  }

  if (!urls.some((url) => /\.(?:js|mjs)$/iu.test(new URL(url).pathname))) {
    fail('WEB_JS_ASSET_MISSING');
  }

  return Object.freeze(urls);
}

function validateWebManifest(raw) {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    Array.isArray(raw) ||
    raw.status !== 'available' ||
    raw.service !== 'web'
  ) {
    fail('WEB_RELEASE_UNAVAILABLE');
  }

  return Object.freeze({
    releaseId: boundedReleaseId(raw.releaseId, 'WEB_RELEASE_INVALID'),
    sourceSha: exactSourceSha(raw.sourceSha, 'WEB_RELEASE_INVALID'),
    apiOrigin: normalizeProductionOrigin(
      raw.apiOrigin,
      'WEB_RELEASE_INVALID_API_ORIGIN',
    ),
  });
}

function validateApiRelease(raw) {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    Array.isArray(raw) ||
    raw.status !== 'available' ||
    raw.service !== 'api'
  ) {
    fail('API_RELEASE_UNAVAILABLE');
  }

  return Object.freeze({
    releaseId: boundedReleaseId(raw.releaseId, 'API_RELEASE_INVALID'),
    sourceSha: exactSourceSha(raw.sourceSha, 'API_RELEASE_INVALID'),
  });
}

async function request(fetcher, url, accept, timeoutMs) {
  let response;
  try {
    response = await fetcher(url, {
      method: 'GET',
      headers: { accept },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    fail('HTTP_REQUEST_FAILED');
  }
  return response;
}

async function jsonResponse(fetcher, url, accept, timeoutMs, httpCode) {
  const response = await request(fetcher, url, accept, timeoutMs);
  if (!response.ok || response.status !== 200) fail(httpCode);

  let body;
  try {
    body = await response.json();
  } catch {
    fail(httpCode);
  }

  return { response, body };
}

function timeout(value) {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(value) ||
    value < 1_000 ||
    value > 30_000
  ) {
    fail('INVALID_TIMEOUT');
  }
  return value;
}

export async function qualifyLiveRelease({
  webOrigin: rawWebOrigin,
  apiOrigin: rawApiOrigin,
  expectedSourceSha: rawExpectedSourceSha,
  fetcher = fetch,
  timeoutMs: rawTimeoutMs,
}) {
  const webOrigin = normalizeProductionOrigin(
    rawWebOrigin,
    'INVALID_WEB_ORIGIN',
  );
  const apiOrigin = normalizeProductionOrigin(
    rawApiOrigin,
    'INVALID_API_ORIGIN',
  );
  const expectedSourceSha = exactSourceSha(rawExpectedSourceSha);
  const timeoutMs = timeout(rawTimeoutMs);

  const webReleaseUrl = new URL('/release.json', webOrigin).toString();
  const apiReleaseUrl = new URL('/health/release', apiOrigin).toString();
  const shellUrl = new URL('/', webOrigin).toString();

  const [webReleaseResponse, apiReleaseResponse, shellResponse] =
    await Promise.all([
      jsonResponse(
        fetcher,
        webReleaseUrl,
        'application/json',
        timeoutMs,
        'WEB_RELEASE_HTTP_FAILED',
      ),
      jsonResponse(
        fetcher,
        apiReleaseUrl,
        'application/json',
        timeoutMs,
        'API_RELEASE_HTTP_FAILED',
      ),
      request(fetcher, shellUrl, 'text/html', timeoutMs),
    ]);

  if (!shellResponse.ok || shellResponse.status !== 200) {
    fail('WEB_SHELL_HTTP_FAILED');
  }

  assertRevalidatableCacheControl(
    webReleaseResponse.response.headers.get('cache-control'),
    'WEB_RELEASE_CACHE_INVALID',
  );
  assertNoStoreCacheControl(
    apiReleaseResponse.response.headers.get('cache-control'),
    'API_RELEASE_CACHE_INVALID',
  );
  assertRevalidatableCacheControl(
    shellResponse.headers.get('cache-control'),
    'WEB_SHELL_CACHE_INVALID',
  );

  const webRelease = validateWebManifest(webReleaseResponse.body);
  const apiRelease = validateApiRelease(apiReleaseResponse.body);

  if (webRelease.apiOrigin !== apiOrigin) {
    fail('WEB_API_ORIGIN_MISMATCH');
  }
  if (webRelease.sourceSha !== apiRelease.sourceSha) {
    fail('WEB_API_SOURCE_SHA_MISMATCH');
  }
  if (
    webRelease.sourceSha !== expectedSourceSha ||
    apiRelease.sourceSha !== expectedSourceSha
  ) {
    fail('EXPECTED_SOURCE_SHA_MISMATCH');
  }

  let shellHtml;
  try {
    shellHtml = await shellResponse.text();
  } catch {
    fail('WEB_SHELL_INVALID');
  }

  const assetUrls = extractHashedAssetUrls(shellHtml, webOrigin);
  const assetResponses = await Promise.all(
    assetUrls.map((url) =>
      request(fetcher, url, '*/*', timeoutMs),
    ),
  );

  for (const response of assetResponses) {
    if (!response.ok || response.status !== 200) {
      fail('WEB_ASSET_HTTP_FAILED');
    }
    assertImmutableAssetCacheControl(
      response.headers.get('cache-control'),
      'WEB_ASSET_CACHE_INVALID',
    );
  }

  return Object.freeze({
    status: 'PASS',
    sourceSha: expectedSourceSha,
    web: Object.freeze({
      origin: webOrigin,
      releaseId: webRelease.releaseId,
      assetCount: assetUrls.length,
    }),
    api: Object.freeze({
      origin: apiOrigin,
      releaseId: apiRelease.releaseId,
    }),
    cache: Object.freeze({
      shell: 'revalidatable',
      releaseManifest: 'revalidatable',
      apiRelease: 'no-store',
      hashedAssets: 'immutable',
    }),
  });
}
