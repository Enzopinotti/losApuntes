import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const baseUrl =
  process.env.LOSAPUNTES_SMOKE_BASE_URL ?? 'http://127.0.0.1:4000';
const REQUEST_TIMEOUT_MS = 5_000;
const EMAIL = 'runtime-smoke@example.test';
const PASSWORD = 'runtime-smoke-authenticated-change-2026';
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

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

function setCatalogWritePermission(enabled) {
  const update = enabled
    ? "{ $addToSet: { platform_permissions: 'academic:catalog:write' } }"
    : "{ $pull: { platform_permissions: 'academic:catalog:write' } }";
  const script = [
    `const result = db.users.updateOne({ email: ${JSON.stringify(EMAIL)} }, ${update});`,
    "if (result.matchedCount !== 1) { printjson(result); quit(2); }",
  ].join('\n');

  execFileSync(
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
  );
}

const login = await request(
  '/auth/mobile/login',
  json('POST', { email: EMAIL, password: PASSWORD }),
);
assert.equal(login.response.status, 200);
const bearer = `Bearer ${login.body.sessionToken}`;

setCatalogWritePermission(false);

const forbidden = await request(
  '/academic/admin/catalog',
  json(
    'POST',
    {
      kind: 'country',
      name: 'Argentina',
      provenance: {
        authorityTier: 'C',
        sourceKey: 'runtime-smoke',
        sourceUrl: 'https://example.test/runtime',
        externalId: 'AR',
      },
    },
    bearer,
  ),
);
assert.equal(forbidden.response.status, 403);
assert.equal(forbidden.body.code, 'ACADEMIC_CATALOG_WRITE_FORBIDDEN');

setCatalogWritePermission(true);

const invalidTimestamp = await request(
  '/academic/admin/catalog',
  json(
    'POST',
    {
      kind: 'country',
      name: 'Invalid Timestamp',
      provenance: {
        authorityTier: 'C',
        sourceKey: 'runtime-smoke-invalid',
        sourceUrl: 'https://example.test/runtime',
        verifiedAt: 'not-a-date',
      },
    },
    bearer,
  ),
);
assert.equal(invalidTimestamp.response.status, 400);
assert.equal(invalidTimestamp.body.code, 'BAD_REQUEST');

async function createNode(body) {
  const result = await request(
    '/academic/admin/catalog',
    json('POST', body, bearer),
  );
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  assert.match(result.body.node.id, UUID_V4);
  return result.body.node;
}

const country = await createNode({
  kind: 'country',
  name: 'Argentina',
  aliases: ['AR'],
  provenance: {
    authorityTier: 'C',
    sourceKey: 'runtime-smoke',
    sourceUrl: 'https://example.test/runtime',
    externalId: 'AR',
  },
});

const institution = await createNode({
  kind: 'institution',
  name: 'Universidad Runtime Smoke',
  aliases: ['URS'],
  parentIds: [country.id],
  provenance: {
    authorityTier: 'C',
    sourceKey: 'runtime-smoke',
    sourceUrl: 'https://example.test/runtime',
    externalId: 'institution-1',
  },
});

const duplicateSourceIdentity = await request(
  '/academic/admin/catalog',
  json(
    'POST',
    {
      kind: 'institution',
      name: 'Duplicate Source Identity',
      parentIds: [country.id],
      provenance: {
        authorityTier: 'C',
        sourceKey: 'runtime-smoke',
        sourceUrl: 'https://example.test/runtime',
        externalId: 'institution-1',
      },
    },
    bearer,
  ),
);
assert.equal(duplicateSourceIdentity.response.status, 409);
assert.equal(
  duplicateSourceIdentity.body.code,
  'ACADEMIC_SOURCE_IDENTITY_EXISTS',
);

const staleRevision = await request(
  `/academic/admin/catalog/${institution.id}`,
  json(
    'PATCH',
    {
      expectedRevision: 999,
      name: 'Stale Runtime Rename',
    },
    bearer,
  ),
);
assert.equal(staleRevision.response.status, 409);
assert.equal(staleRevision.body.code, 'ACADEMIC_REVISION_CONFLICT');

const program = await createNode({
  kind: 'program',
  name: 'Ingeniería Runtime',
  parentIds: [institution.id],
  provenance: {
    authorityTier: 'C',
    sourceKey: 'runtime-smoke',
    sourceUrl: 'https://example.test/runtime',
    externalId: 'program-1',
  },
});

const curriculum = await createNode({
  kind: 'curriculum',
  name: 'Plan 2026',
  parentIds: [program.id],
  provenance: {
    authorityTier: 'C',
    sourceKey: 'runtime-smoke',
    sourceUrl: 'https://example.test/runtime',
    externalId: 'plan-2026',
  },
});

const subject = await createNode({
  kind: 'subject',
  name: 'Base de Datos',
  aliases: ['BD'],
  parentIds: [curriculum.id],
  provenance: {
    authorityTier: 'C',
    sourceKey: 'runtime-smoke',
    sourceUrl: 'https://example.test/runtime',
    externalId: 'subject-db',
  },
});

const offering = await createNode({
  kind: 'course_offering',
  name: 'Base de Datos · 2026 S2',
  parentIds: [subject.id],
  provenance: {
    authorityTier: 'C',
    sourceKey: 'runtime-smoke',
    sourceUrl: 'https://example.test/runtime',
    externalId: 'offering-db-2026-s2',
  },
});

const invalidParent = await request(
  '/academic/admin/catalog',
  json(
    'POST',
    {
      kind: 'subject',
      name: 'Invalid Subject',
      parentIds: [country.id],
      provenance: {
        authorityTier: 'C',
        sourceKey: 'runtime-smoke',
        sourceUrl: 'https://example.test/runtime',
        externalId: 'invalid-subject',
      },
    },
    bearer,
  ),
);
assert.equal(invalidParent.response.status, 422);
assert.equal(invalidParent.body.code, 'ACADEMIC_PARENT_INVALID');

const publicSearch = await request(
  '/academic/catalog/search?kind=institution&q=urs&limit=10',
);
assert.equal(publicSearch.response.status, 200);
assert.equal(publicSearch.body.items.length, 1);
assert.equal(publicSearch.body.items[0].id, institution.id);

const affiliationResult = await request(
  '/academic/me/affiliations',
  json(
    'POST',
    {
      institutionId: institution.id,
      programId: program.id,
      curriculumId: curriculum.id,
      status: 'active',
      startedOn: '2026',
    },
    bearer,
  ),
);
assert.equal(
  affiliationResult.response.status,
  201,
  JSON.stringify(affiliationResult.body),
);
const affiliationId = affiliationResult.body.affiliation.id;

const participationResult = await request(
  `/academic/me/subjects/${subject.id}`,
  json(
    'PUT',
    {
      courseOfferingId: offering.id,
      state: 'current',
      periodLabel: '2026 S2',
    },
    bearer,
  ),
);
assert.equal(participationResult.response.status, 200);
const participationId = participationResult.body.participation.id;

const contextResult = await request(
  '/academic/me/context',
  json(
    'PUT',
    {
      affiliationId,
      subjectParticipationId: participationId,
    },
    bearer,
  ),
);
assert.equal(contextResult.response.status, 200);
assert.equal(contextResult.body.context.affiliationId, affiliationId);
assert.equal(
  contextResult.body.context.subjectParticipationId,
  participationId,
);

const proposalResult = await request(
  '/academic/proposals',
  json(
    'POST',
    {
      kind: 'subject',
      proposedName: 'Materia pendiente',
      parentIds: [curriculum.id],
      evidenceUrl: 'https://example.test/evidence',
      notes: 'Runtime smoke proposal',
    },
    bearer,
  ),
);
assert.equal(proposalResult.response.status, 201);
assert.equal(proposalResult.body.proposal.status, 'pending');
const proposalId = proposalResult.body.proposal.id;

const proposalQueue = await request(
  '/academic/admin/proposals?status=pending&limit=20',
  { headers: { authorization: bearer } },
);
assert.equal(proposalQueue.response.status, 200);
assert.equal(
  proposalQueue.body.proposals.some((proposal) => proposal.id === proposalId),
  true,
);

const proposalReview = await request(
  `/academic/admin/proposals/${proposalId}/review`,
  json(
    'PATCH',
    {
      status: 'duplicate',
      canonicalTargetId: subject.id,
      reason: 'Runtime smoke duplicate mapping',
    },
    bearer,
  ),
);
assert.equal(proposalReview.response.status, 200);
assert.equal(proposalReview.body.proposal.status, 'duplicate');
assert.equal(proposalReview.body.proposal.canonicalTargetId, subject.id);

const proposalReplay = await request(
  `/academic/admin/proposals/${proposalId}/review`,
  json(
    'PATCH',
    {
      status: 'duplicate',
      canonicalTargetId: subject.id,
      reason: 'Runtime smoke duplicate replay',
    },
    bearer,
  ),
);
assert.equal(proposalReplay.response.status, 409);
assert.equal(
  proposalReplay.body.code,
  'ACADEMIC_PROPOSAL_ALREADY_REVIEWED',
);

const duplicateInstitution = await createNode({
  kind: 'institution',
  name: 'Universidad Runtime Smoke Duplicate',
  parentIds: [country.id],
  provenance: {
    authorityTier: 'C',
    sourceKey: 'runtime-smoke',
    sourceUrl: 'https://example.test/runtime',
    externalId: 'institution-duplicate',
  },
});

const duplicateProgram = await createNode({
  kind: 'program',
  name: 'Programa bajo institución fusionada',
  parentIds: [duplicateInstitution.id],
  provenance: {
    authorityTier: 'C',
    sourceKey: 'runtime-smoke',
    sourceUrl: 'https://example.test/runtime',
    externalId: 'program-under-merged-institution',
  },
});

const legacyAffiliationResult = await request(
  '/academic/me/affiliations',
  json(
    'POST',
    {
      institutionId: duplicateInstitution.id,
      programId: duplicateProgram.id,
      status: 'active',
    },
    bearer,
  ),
);
assert.equal(legacyAffiliationResult.response.status, 201);
const legacyAffiliationId = legacyAffiliationResult.body.affiliation.id;

const mergeResult = await request(
  `/academic/admin/catalog/${duplicateInstitution.id}/merge`,
  json(
    'POST',
    {
      targetId: institution.id,
      expectedRevision: duplicateInstitution.revision,
    },
    bearer,
  ),
);
assert.equal(mergeResult.response.status, 201);
assert.equal(mergeResult.body.source.status, 'merged');
assert.equal(mergeResult.body.source.redirectToId, institution.id);

const redirected = await request(
  `/academic/catalog/${duplicateInstitution.id}`,
);
assert.equal(redirected.response.status, 200);
assert.equal(redirected.body.node.id, institution.id);
assert.equal(redirected.body.resolvedFromId, duplicateInstitution.id);

const mergedChildren = await request(
  `/academic/catalog/${institution.id}/children?kind=program&limit=50`,
);
assert.equal(mergedChildren.response.status, 200);
assert.equal(
  mergedChildren.body.items.some((item) => item.id === duplicateProgram.id),
  true,
);

const affiliationsAfterMerge = await request('/academic/me/affiliations', {
  headers: { authorization: bearer },
});
assert.equal(affiliationsAfterMerge.response.status, 200);
const canonicalizedLegacyAffiliation =
  affiliationsAfterMerge.body.affiliations.find(
    (affiliation) => affiliation.id === legacyAffiliationId,
  );
assert.equal(canonicalizedLegacyAffiliation.institutionId, institution.id);
assert.equal(canonicalizedLegacyAffiliation.programId, duplicateProgram.id);

const auditCountScript = [
  "const count = db.academic_audit_events.countDocuments({});",
  "if (count < 10) { print(count); quit(2); }",
].join('\n');

execFileSync(
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
    auditCountScript,
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
);

console.log(
  JSON.stringify({
    event: 'academic.lifecycle.smoke.ok',
    checks: [
      'permission-deny-by-default',
      'catalog-write',
      'invalid-provenance-timestamp',
      'source-identity-conflict',
      'optimistic-revision-conflict',
      'hierarchy-validation',
      'alias-search',
      'affiliation',
      'subject-participation',
      'current-context',
      'provisional-proposal',
      'proposal-admin-review',
      'proposal-review-replay-conflict',
      'merge-redirect',
      'merge-preserves-child-discovery',
      'merge-canonicalizes-affiliation-projection',
      'transaction-backed-audit',
      'durable-audit',
    ],
  }),
);
