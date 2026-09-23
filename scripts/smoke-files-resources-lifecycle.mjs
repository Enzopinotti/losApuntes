import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl =
  process.env.LOSAPUNTES_SMOKE_BASE_URL ?? 'http://127.0.0.1:4000';
const REQUEST_TIMEOUT_MS = 8_000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function json(method, body, bearer) {
  return {
    method,
    headers: {
      'content-type': 'application/json',
      ...(bearer ? { authorization: bearer } : {}),
    },
    body: JSON.stringify(body),
  };
}

function mongoEval(script) {
  return execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'compose.local.yml',
      'exec',
      '-T',
      'mongo',
      'mongosh',
      '--quiet',
      'losapuntes_local',
      '--eval',
      script,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

async function createVerifiedUser(label) {
  const email = `files-${label}-${randomUUID()}@example.test`.toLowerCase();
  const password = `Files smoke ${randomUUID()} ${randomUUID()}`;

  const registration = await request(
    '/auth/register',
    json('POST', { email, password }),
  );
  assert.equal(registration.response.status, 202);

  mongoEval(
    [
      `const result = db.users.updateOne({ email: ${JSON.stringify(
        email,
      )} }, { $set: { email_verified_at: new Date() } });`,
      "if (result.matchedCount !== 1) { printjson(result); quit(2); }",
    ].join('\n'),
  );

  const login = await request(
    '/auth/mobile/login',
    json('POST', { email, password }),
  );
  assert.equal(login.response.status, 200, JSON.stringify(login.body));

  const bearer = `Bearer ${login.body.sessionToken}`;
  const profile = await request(
    '/profile/me',
    json('POST', { displayName: `Files ${label}` }, bearer),
  );
  assert.equal(profile.response.status, 201, JSON.stringify(profile.body));
  assert.match(profile.body.profile.id, UUID_V4);

  return {
    email,
    bearer,
    profileId: profile.body.profile.id,
  };
}

async function createReadyPdf(bearer, filename, label) {
  const bytes = Buffer.from(`%PDF-1.7\n${label}\n%%EOF\n`, 'utf8');
  const intent = await request(
    '/files/upload-intents',
    json(
      'POST',
      {
        filename,
        mimeType: 'application/pdf',
        byteSize: bytes.byteLength,
      },
      bearer,
    ),
  );
  assert.equal(intent.response.status, 201, JSON.stringify(intent.body));
  assert.match(intent.body.file.id, UUID_V4);
  assert.equal('objectKey' in intent.body.file, false);

  const upload = await fetch(intent.body.upload.url, {
    method: intent.body.upload.method,
    headers: intent.body.upload.headers,
    body: bytes,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  assert.equal(upload.ok, true, `PUT failed with ${upload.status}`);

  const replacementBytes = Buffer.from(bytes);
  replacementBytes[replacementBytes.length - 1] =
    replacementBytes[replacementBytes.length - 1] === 0x0a ? 0x21 : 0x0a;
  assert.equal(replacementBytes.byteLength, bytes.byteLength);

  const replacement = await fetch(intent.body.upload.url, {
    method: intent.body.upload.method,
    headers: intent.body.upload.headers,
    body: replacementBytes,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  assert.equal(
    replacement.ok,
    false,
    'A signed upload intent must not replace an existing object',
  );

  const finalized = await request(
    `/files/${intent.body.file.id}/finalize`,
    {
      method: 'POST',
      headers: { authorization: bearer },
    },
  );
  assert.equal(
    finalized.response.status,
    201,
    JSON.stringify(finalized.body),
  );
  assert.equal(finalized.body.file.state, 'ready');

  const replay = await request(
    `/files/${intent.body.file.id}/finalize`,
    {
      method: 'POST',
      headers: { authorization: bearer },
    },
  );
  assert.equal(replay.response.status, 201);
  assert.equal(replay.body.file.id, finalized.body.file.id);

  return { bytes, file: finalized.body.file };
}

async function createResource(bearer, subjectId, fileId, title, visibility) {
  const created = await request(
    '/resources',
    json(
      'POST',
      {
        assetId: fileId,
        title,
        description: 'Runtime Files + Notes smoke',
        tags: ['runtime', 'smoke'],
        subjectId,
        visibility,
      },
      bearer,
    ),
  );
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.match(created.body.resource.id, UUID_V4);
  return created.body.resource;
}

async function waitForReclaimed(fileId) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const state = mongoEval(
      [
        `const row = db.file_assets.findOne({ id: ${JSON.stringify(
          fileId,
        )} });`,
        "print(row ? row.state : 'missing');",
      ].join('\n'),
    );

    if (state === 'reclaimed') return;
    await delay(500);
  }

  throw new Error(`Timed out waiting for file ${fileId} reclamation`);
}

const author = await createVerifiedUser('Author');
const viewer = await createVerifiedUser('Viewer');

const subjectSearch = await request(
  '/academic/catalog/search?kind=subject&q=base%20de%20datos&limit=20',
);
assert.equal(subjectSearch.response.status, 200);
const subject = subjectSearch.body.items.find(
  (item) => item.name === 'Base de Datos',
);
assert.ok(subject, 'Academic smoke must create Base de Datos subject');

const wrongSizeBytes = Buffer.from(
  '%PDF-1.7\nsize-bound-runtime\n%%EOF\n',
  'utf8',
);
const wrongSizeIntent = await request(
  '/files/upload-intents',
  json(
    'POST',
    {
      filename: 'size-bound.pdf',
      mimeType: 'application/pdf',
      byteSize: wrongSizeBytes.byteLength + 1,
    },
    author.bearer,
  ),
);
assert.equal(wrongSizeIntent.response.status, 201);
const wrongSizePut = await fetch(wrongSizeIntent.body.upload.url, {
  method: wrongSizeIntent.body.upload.method,
  headers: wrongSizeIntent.body.upload.headers,
  body: wrongSizeBytes,
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});
assert.equal(
  wrongSizePut.ok,
  false,
  'Storage must reject a body whose Content-Length differs from the signed intent',
);

const wrongSizeFinalize = await request(
  `/files/${wrongSizeIntent.body.file.id}/finalize`,
  {
    method: 'POST',
    headers: { authorization: author.bearer },
  },
);
assert.equal(wrongSizeFinalize.response.status, 409);
assert.equal(wrongSizeFinalize.body.code, 'FILE_UPLOAD_INCOMPLETE');

const primaryUpload = await createReadyPdf(
  author.bearer,
  'base-datos.pdf',
  'primary-resource',
);
const primary = await createResource(
  author.bearer,
  subject.id,
  primaryUpload.file.id,
  'Apunte Runtime Primario',
  'private',
);

const crossUserFinalize = await request(
  `/files/${primaryUpload.file.id}/finalize`,
  {
    method: 'POST',
    headers: { authorization: viewer.bearer },
  },
);
assert.equal(crossUserFinalize.response.status, 404);
assert.equal(crossUserFinalize.body.code, 'FILE_UPLOAD_NOT_FOUND');

const duplicateClaim = await request(
  '/resources',
  json(
    'POST',
    {
      assetId: primaryUpload.file.id,
      title: 'Duplicate asset claim',
      subjectId: subject.id,
      visibility: 'private',
    },
    author.bearer,
  ),
);
assert.equal(duplicateClaim.response.status, 409);
assert.equal(duplicateClaim.body.code, 'RESOURCE_ASSET_UNAVAILABLE');

const anonymousPrivate = await request(`/resources/${primary.id}`);
assert.equal(anonymousPrivate.response.status, 404);

const viewerPrivate = await request(`/resources/${primary.id}`, {
  headers: { authorization: viewer.bearer },
});
assert.equal(viewerPrivate.response.status, 404);

const shareWhilePrivate = await request(
  `/resources/${primary.id}/shares/${viewer.profileId}`,
  {
    method: 'PUT',
    headers: { authorization: author.bearer },
  },
);
assert.equal(shareWhilePrivate.response.status, 409);
assert.equal(
  shareWhilePrivate.body.code,
  'RESOURCE_SHARE_VISIBILITY_REQUIRED',
);

const sharedUpdate = await request(
  `/resources/${primary.id}`,
  json(
    'PATCH',
    {
      expectedRevision: primary.revision,
      visibility: 'shared',
    },
    author.bearer,
  ),
);
assert.equal(sharedUpdate.response.status, 200);
assert.equal(sharedUpdate.body.resource.visibility, 'shared');
assert.equal(
  sharedUpdate.body.resource.revision,
  primary.revision + 1,
);

const share = await request(
  `/resources/${primary.id}/shares/${viewer.profileId}`,
  {
    method: 'PUT',
    headers: { authorization: author.bearer },
  },
);
assert.equal(share.response.status, 200);
assert.deepEqual(share.body, { shared: true });

const viewerShared = await request(`/resources/${primary.id}`, {
  headers: { authorization: viewer.bearer },
});
assert.equal(viewerShared.response.status, 200);
assert.equal(viewerShared.body.resource.id, primary.id);

const secondUpload = await createReadyPdf(
  author.bearer,
  'unshared.pdf',
  'second-resource',
);
const unshared = await createResource(
  author.bearer,
  subject.id,
  secondUpload.file.id,
  'Apunte Runtime No Compartido',
  'shared',
);

const sharedSearch = await request(
  `/resources?subjectId=${subject.id}&visibility=shared&limit=50`,
  { headers: { authorization: viewer.bearer } },
);
assert.equal(sharedSearch.response.status, 200);
assert.equal(
  sharedSearch.body.items.some((item) => item.id === primary.id),
  true,
);
assert.equal(
  sharedSearch.body.items.some((item) => item.id === unshared.id),
  false,
  'A share on one resource must not authorize another shared resource',
);

const signedAccess = await request(
  `/resources/${primary.id}/access`,
  json('POST', { disposition: 'inline' }, viewer.bearer),
);
assert.equal(signedAccess.response.status, 201, JSON.stringify(signedAccess.body));
assert.equal('objectKey' in signedAccess.body.file, false);
const signedUrl = signedAccess.body.access.url;

const immediateDownload = await fetch(signedUrl, {
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});
assert.equal(immediateDownload.ok, true);
assert.deepEqual(
  Buffer.from(await immediateDownload.arrayBuffer()),
  primaryUpload.bytes,
);

await delay(3_000);
const expiredDownload = await fetch(signedUrl, {
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});
assert.equal(expiredDownload.ok, false, 'Signed GET must expire');

const unshare = await request(
  `/resources/${primary.id}/shares/${viewer.profileId}`,
  {
    method: 'DELETE',
    headers: { authorization: author.bearer },
  },
);
assert.equal(unshare.response.status, 200);

const viewerAfterRevoke = await request(`/resources/${primary.id}`, {
  headers: { authorization: viewer.bearer },
});
assert.equal(viewerAfterRevoke.response.status, 404);

const accessAfterRevoke = await request(
  `/resources/${primary.id}/access`,
  json('POST', { disposition: 'inline' }, viewer.bearer),
);
assert.equal(accessAfterRevoke.response.status, 404);

const publicUpdate = await request(
  `/resources/${primary.id}`,
  json(
    'PATCH',
    {
      expectedRevision: sharedUpdate.body.resource.revision,
      visibility: 'public',
    },
    author.bearer,
  ),
);
assert.equal(publicUpdate.response.status, 200);
assert.equal(publicUpdate.body.resource.visibility, 'public');
assert.equal(publicUpdate.body.resource.revision, primary.revision + 1);

const publicAnonymous = await request(`/resources/${primary.id}`);
assert.equal(publicAnonymous.response.status, 200);
assert.equal(publicAnonymous.body.resource.id, primary.id);

const publicSearch = await request(
  '/resources?q=runtime%20primario&limit=20',
);
assert.equal(publicSearch.response.status, 200);
assert.equal(
  publicSearch.body.items.some((item) => item.id === primary.id),
  true,
);

const save = await request(`/resources/${primary.id}/save`, {
  method: 'PUT',
  headers: { authorization: viewer.bearer },
});
assert.equal(save.response.status, 200);
assert.deepEqual(save.body, { saved: true });

const report = await request(
  `/resources/${primary.id}/reports`,
  json(
    'POST',
    {
      reason: 'other',
      details: 'Runtime report',
    },
    viewer.bearer,
  ),
);
assert.equal(report.response.status, 201);
assert.equal(report.body.report.status, 'pending');
const repeatedReport = await request(
  `/resources/${primary.id}/reports`,
  json(
    'POST',
    {
      reason: 'other',
      details: 'Second attempt',
    },
    viewer.bearer,
  ),
);
assert.equal(repeatedReport.response.status, 201);
assert.equal(repeatedReport.body.report.id, report.body.report.id);

const privateAgain = await request(
  `/resources/${primary.id}`,
  json(
    'PATCH',
    {
      expectedRevision: publicUpdate.body.resource.revision,
      visibility: 'private',
    },
    author.bearer,
  ),
);
assert.equal(privateAgain.response.status, 200);
assert.equal(privateAgain.body.resource.visibility, 'private');

const sharedAgain = await request(
  `/resources/${primary.id}`,
  json(
    'PATCH',
    {
      expectedRevision: privateAgain.body.resource.revision,
      visibility: 'shared',
    },
    author.bearer,
  ),
);
assert.equal(sharedAgain.response.status, 200);
assert.equal(sharedAgain.body.resource.visibility, 'shared');

const staleGrantMustNotRevive = await request(`/resources/${primary.id}`, {
  headers: { authorization: viewer.bearer },
});
assert.equal(
  staleGrantMustNotRevive.response.status,
  404,
  'Leaving shared visibility must remove historical explicit grants',
);

const savedAfterPrivacyChange = await request('/resources/saved?limit=25', {
  headers: { authorization: viewer.bearer },
});
assert.equal(savedAfterPrivacyChange.response.status, 200);
assert.equal(
  savedAfterPrivacyChange.body.items.some((item) => item.id === primary.id),
  false,
  'Saved relation must not preserve access after privacy change',
);

const hiddenFromPublicSearch = await request(
  '/resources?q=runtime%20primario&limit=20',
);
assert.equal(hiddenFromPublicSearch.response.status, 200);
assert.equal(
  hiddenFromPublicSearch.body.items.some((item) => item.id === primary.id),
  false,
);

const cleanupBytes = Buffer.from('%PDF-1.7\ncleanup\n%%EOF\n', 'utf8');
const cleanupIntent = await request(
  '/files/upload-intents',
  json(
    'POST',
    {
      filename: 'abandoned.pdf',
      mimeType: 'application/pdf',
      byteSize: cleanupBytes.byteLength,
    },
    author.bearer,
  ),
);
assert.equal(cleanupIntent.response.status, 201);
const cleanupPut = await fetch(cleanupIntent.body.upload.url, {
  method: cleanupIntent.body.upload.method,
  headers: cleanupIntent.body.upload.headers,
  body: cleanupBytes,
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});
assert.equal(cleanupPut.ok, true);

const cleanupObjectKey = mongoEval(
  [
    `const id = ${JSON.stringify(cleanupIntent.body.file.id)};`,
    "const row = db.file_assets.findOne({ id });",
    "if (!row) quit(2);",
    "db.file_assets.updateOne({ id }, { $set: { expiresAt: new Date(Date.now() - 60000) } });",
    "print(row.objectKey);",
  ].join('\n'),
);
assert.ok(cleanupObjectKey.startsWith('resource-assets/'));

const beforeCleanupStat = spawnSync(
  'docker',
  [
    'compose',
    '-f',
    'compose.local.yml',
    'exec',
    '-T',
    'minio',
    'sh',
    '-lc',
    `mc alias set smoke http://127.0.0.1:9000 losapuntes-local losapuntes-local-files-secret >/dev/null && mc stat "smoke/losapuntes-files/${cleanupObjectKey}" >/dev/null`,
  ],
  { encoding: 'utf8' },
);
assert.equal(beforeCleanupStat.status, 0, beforeCleanupStat.stderr);

await waitForReclaimed(cleanupIntent.body.file.id);

const afterCleanupStat = spawnSync(
  'docker',
  [
    'compose',
    '-f',
    'compose.local.yml',
    'exec',
    '-T',
    'minio',
    'sh',
    '-lc',
    `mc alias set smoke http://127.0.0.1:9000 losapuntes-local losapuntes-local-files-secret >/dev/null && mc stat "smoke/losapuntes-files/${cleanupObjectKey}" >/dev/null 2>&1`,
  ],
  { encoding: 'utf8' },
);
assert.notEqual(
  afterCleanupStat.status,
  0,
  'Cleanup worker must remove abandoned object bytes',
);

console.log(
  JSON.stringify({
    event: 'files.resources.lifecycle.smoke.ok',
    checks: [
      'direct-private-object-upload',
      'signed-content-length-bound',
      'immutable-signed-put',
      'cross-user-file-finalize-deny',
      'finalize-idempotency',
      'asset-single-claim',
      'private-deny',
      'grant-requires-shared-visibility',
      'explicit-share',
      'share-is-resource-scoped',
      'signed-download',
      'signed-download-expiry',
      'share-revocation',
      'public-metadata',
      'bounded-search',
      'save-does-not-grant-access',
      'report-idempotency',
      'privacy-transition',
      'privacy-transition-clears-explicit-grants',
      'abandoned-upload-byte-cleanup',
    ],
  }),
);
