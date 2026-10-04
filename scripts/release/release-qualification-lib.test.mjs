import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ReleaseQualificationError,
  extractHashedAssetUrls,
  qualifyLiveRelease,
} from './release-qualification-lib.mjs';

const WEB_ORIGIN = 'https://app.example.test';
const API_ORIGIN = 'https://api.example.test';
const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

function response(body, cacheControl, contentType) {
  return new Response(body, {
    status: 200,
    headers: {
      'cache-control': cacheControl,
      'content-type': contentType,
    },
  });
}

function fixtures(overrides = {}) {
  const shell =
    overrides.shell ??
    '<!doctype html><script type="module" src="/assets/index-AbCd1234.js"></script><link rel="stylesheet" href="/assets/index-ZyXw9876.css">';
  const webRelease = {
    status: 'available',
    service: 'web',
    releaseId: 'web-2026.10.04-1',
    sourceSha: SHA,
    apiOrigin: API_ORIGIN,
    ...(overrides.webRelease ?? {}),
  };
  const apiRelease = {
    status: 'available',
    service: 'api',
    releaseId: 'api-2026.10.04-1',
    sourceSha: SHA,
    ...(overrides.apiRelease ?? {}),
  };

  return async (input) => {
    const url = String(input);

    if (url === `${WEB_ORIGIN}/release.json`) {
      return response(
        JSON.stringify(webRelease),
        overrides.webReleaseCache ?? 'no-cache',
        'application/json',
      );
    }
    if (url === `${API_ORIGIN}/health/release`) {
      return response(
        JSON.stringify(apiRelease),
        overrides.apiReleaseCache ?? 'no-store',
        'application/json',
      );
    }
    if (url === `${WEB_ORIGIN}/`) {
      return response(
        shell,
        overrides.shellCache ?? 'max-age=0, must-revalidate',
        'text/html',
      );
    }
    if (
      url === `${WEB_ORIGIN}/assets/index-AbCd1234.js` ||
      url === `${WEB_ORIGIN}/assets/index-ZyXw9876.css`
    ) {
      return response(
        'asset',
        overrides.assetCache ?? 'public, max-age=31536000, immutable',
        'application/octet-stream',
      );
    }

    return new Response('missing', { status: 404 });
  };
}

async function expectReason(reasonCode, operation) {
  await assert.rejects(operation, (error) => {
    assert.equal(error instanceof ReleaseQualificationError, true);
    assert.equal(error.code, reasonCode);
    return true;
  });
}

test('qualifies one exact Web/API release with safe cache policies', async () => {
  const evidence = await qualifyLiveRelease({
    webOrigin: WEB_ORIGIN,
    apiOrigin: API_ORIGIN,
    expectedSourceSha: SHA,
    fetcher: fixtures(),
  });

  assert.deepEqual(evidence, {
    status: 'PASS',
    sourceSha: SHA,
    web: {
      origin: WEB_ORIGIN,
      releaseId: 'web-2026.10.04-1',
      assetCount: 2,
    },
    api: {
      origin: API_ORIGIN,
      releaseId: 'api-2026.10.04-1',
    },
    cache: {
      shell: 'revalidatable',
      releaseManifest: 'revalidatable',
      apiRelease: 'no-store',
      hashedAssets: 'immutable',
    },
  });
});

test('requires production HTTPS origins', async () => {
  await expectReason('INVALID_WEB_ORIGIN', () =>
    qualifyLiveRelease({
      webOrigin: 'http://app.example.test',
      apiOrigin: API_ORIGIN,
      expectedSourceSha: SHA,
      fetcher: fixtures(),
    }),
  );

  await expectReason('INVALID_API_ORIGIN', () =>
    qualifyLiveRelease({
      webOrigin: WEB_ORIGIN,
      apiOrigin: 'https://user:pass@api.example.test',
      expectedSourceSha: SHA,
      fetcher: fixtures(),
    }),
  );
});

test('rejects API origin embedded by a different Web build', async () => {
  await expectReason('WEB_API_ORIGIN_MISMATCH', () =>
    qualifyLiveRelease({
      webOrigin: WEB_ORIGIN,
      apiOrigin: API_ORIGIN,
      expectedSourceSha: SHA,
      fetcher: fixtures({
        webRelease: { apiOrigin: 'https://other-api.example.test' },
      }),
    }),
  );
});

test('rejects Web/API source SHA mismatch', async () => {
  await expectReason('WEB_API_SOURCE_SHA_MISMATCH', () =>
    qualifyLiveRelease({
      webOrigin: WEB_ORIGIN,
      apiOrigin: API_ORIGIN,
      expectedSourceSha: SHA,
      fetcher: fixtures({
        apiRelease: { sourceSha: OTHER_SHA },
      }),
    }),
  );
});

test('rejects a deployment that does not match the expected candidate SHA', async () => {
  await expectReason('EXPECTED_SOURCE_SHA_MISMATCH', () =>
    qualifyLiveRelease({
      webOrigin: WEB_ORIGIN,
      apiOrigin: API_ORIGIN,
      expectedSourceSha: OTHER_SHA,
      fetcher: fixtures(),
    }),
  );
});

test('requires API release identity to be no-store', async () => {
  await expectReason('API_RELEASE_CACHE_INVALID', () =>
    qualifyLiveRelease({
      webOrigin: WEB_ORIGIN,
      apiOrigin: API_ORIGIN,
      expectedSourceSha: SHA,
      fetcher: fixtures({ apiReleaseCache: 'max-age=60' }),
    }),
  );
});

test('requires shell and release manifest to be revalidatable and non-immutable', async () => {
  await expectReason('WEB_SHELL_CACHE_INVALID', () =>
    qualifyLiveRelease({
      webOrigin: WEB_ORIGIN,
      apiOrigin: API_ORIGIN,
      expectedSourceSha: SHA,
      fetcher: fixtures({ shellCache: 'public, max-age=3600, immutable' }),
    }),
  );

  await expectReason('WEB_RELEASE_CACHE_INVALID', () =>
    qualifyLiveRelease({
      webOrigin: WEB_ORIGIN,
      apiOrigin: API_ORIGIN,
      expectedSourceSha: SHA,
      fetcher: fixtures({ webReleaseCache: 'public, max-age=31536000, immutable' }),
    }),
  );
});

test('requires hashed Vite assets and long-lived immutable caching', async () => {
  await expectReason('WEB_ASSET_CACHE_INVALID', () =>
    qualifyLiveRelease({
      webOrigin: WEB_ORIGIN,
      apiOrigin: API_ORIGIN,
      expectedSourceSha: SHA,
      fetcher: fixtures({ assetCache: 'public, max-age=60' }),
    }),
  );

  assert.throws(
    () =>
      extractHashedAssetUrls(
        '<script src="/assets/index.js"></script>',
        WEB_ORIGIN,
      ),
    (error) => {
      assert.equal(error.code, 'WEB_ASSET_UNHASHED');
      return true;
    },
  );
});

test('does not accept a shell without a hashed JavaScript entry asset', () => {
  assert.throws(
    () =>
      extractHashedAssetUrls(
        '<link rel="stylesheet" href="/assets/index-ZyXw9876.css">',
        WEB_ORIGIN,
      ),
    (error) => {
      assert.equal(error.code, 'WEB_JS_ASSET_MISSING');
      return true;
    },
  );
});
