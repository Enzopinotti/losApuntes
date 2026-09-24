import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

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
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body };
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

async function createActor(label) {
  const email =
    ('org-' + label + '-' + randomUUID() + '@example.test').toLowerCase();
  const password = 'Organizations runtime ' + randomUUID() + ' ' + randomUUID();

  const registration = await request(
    '/auth/register',
    json('POST', { email, password }),
  );
  assert.equal(registration.response.status, 202);

  mongoEval(
    [
      'const email = ' + JSON.stringify(email) + ';',
      'const result = db.users.updateOne({ email }, { $set: { email_verified_at: new Date() } });',
      "if (result.matchedCount !== 1) { printjson(result); quit(2); }",
    ].join('\n'),
  );

  const login = await request(
    '/auth/mobile/login',
    json('POST', { email, password }),
  );
  assert.equal(login.response.status, 200, JSON.stringify(login.body));
  const bearer = 'Bearer ' + login.body.sessionToken;

  const profile = await request(
    '/profile/me',
    json('POST', { displayName: 'Org ' + label }, bearer),
  );
  assert.equal(profile.response.status, 201, JSON.stringify(profile.body));

  return {
    email,
    bearer,
    profileId: profile.body.profile.id,
  };
}

function setPermissions(actor, permissions) {
  mongoEval(
    [
      'const email = ' + JSON.stringify(actor.email) + ';',
      'const permissions = ' + JSON.stringify(permissions) + ';',
      'const result = db.users.updateOne({ email }, { $set: { platform_permissions: permissions } });',
      "if (result.matchedCount !== 1) { printjson(result); quit(2); }",
    ].join('\n'),
  );
}

const owner = await createActor('Owner');
const admin = await createActor('Admin');
const viewer = await createActor('Viewer');
const operator = await createActor('Operator');

setPermissions(owner, ['academic:catalog:write']);
setPermissions(operator, [
  'organizations:verify',
  'pilot:ops:read',
  'moderation:write',
]);

async function createNode(body) {
  const result = await request(
    '/academic/admin/catalog',
    json('POST', body, owner.bearer),
  );
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.node;
}

const sourceSuffix = randomUUID();
const country = await createNode({
  kind: 'country',
  name: 'Argentina Organizations Smoke ' + sourceSuffix.slice(0, 8),
  provenance: {
    authorityTier: 'C',
    sourceKey: 'organizations-runtime-' + sourceSuffix,
    sourceUrl: 'https://example.test/organizations-runtime',
    externalId: 'country',
  },
});
const institution = await createNode({
  kind: 'institution',
  name: 'Universidad Organizations Runtime',
  parentIds: [country.id],
  provenance: {
    authorityTier: 'C',
    sourceKey: 'organizations-runtime-' + sourceSuffix,
    sourceUrl: 'https://example.test/organizations-runtime',
    externalId: 'institution',
  },
});

const created = await request(
  '/organizations',
  json(
    'POST',
    {
      name: ' Centro   Runtime ',
      type: 'student_center',
      institutionId: institution.id,
      about: 'Organización de prueba',
      websiteUrl: 'https://example.test/centro',
    },
    owner.bearer,
  ),
);
assert.equal(created.response.status, 201, JSON.stringify(created.body));
const organization = created.body.organization;
assert.match(organization.id, UUID_V4);
assert.equal(organization.name, 'Centro Runtime');
assert.equal(organization.verificationState, 'unverified');
assert.equal(organization.claimState, 'claimed');
assert.equal(organization.viewer.managementRole, 'owner');
assert.equal(organization.scope.institution.id, institution.id);

const anonymous = await request('/organizations/' + organization.id);
assert.equal(anonymous.response.status, 200, JSON.stringify(anonymous.body));
assert.equal(anonymous.body.organization.viewer, undefined);
assert.equal(
  anonymous.body.organization.verificationState,
  'unverified',
);

const forbiddenUpdate = await request(
  '/organizations/' + organization.id,
  json(
    'PATCH',
    {
      expectedRevision: organization.revision,
      about: 'No autorizado',
    },
    viewer.bearer,
  ),
);
assert.equal(forbiddenUpdate.response.status, 403);
assert.equal(
  forbiddenUpdate.body.code,
  'ORGANIZATION_MANAGEMENT_FORBIDDEN',
);

const ownerVerification = await request(
  '/organizations/' + organization.id + '/verification',
  json(
    'PATCH',
    {
      verificationState: 'verified',
      reason: 'Owner must not self verify',
      expectedRevision: organization.revision,
    },
    owner.bearer,
  ),
);
assert.equal(ownerVerification.response.status, 403);
assert.equal(
  ownerVerification.body.code,
  'ORGANIZATION_VERIFICATION_FORBIDDEN',
);

const verified = await request(
  '/organizations/' + organization.id + '/verification',
  json(
    'PATCH',
    {
      verificationState: 'verified',
      reason: 'Runtime evidence reviewed',
      expectedRevision: organization.revision,
    },
    operator.bearer,
  ),
);
assert.equal(verified.response.status, 200, JSON.stringify(verified.body));
assert.equal(verified.body.organization.verificationState, 'verified');

let management = await request(
  '/organizations/' + organization.id + '/manage',
  { headers: { authorization: owner.bearer } },
);
assert.equal(management.response.status, 200, JSON.stringify(management.body));

const addAdmin = await request(
  '/organizations/' +
    organization.id +
    '/managers/' +
    admin.profileId,
  json(
    'PUT',
    {
      role: 'admin',
      reason: 'Runtime admin delegation',
      expectedManagementRevision:
        management.body.organization.managementRevision,
    },
    owner.bearer,
  ),
);
assert.equal(addAdmin.response.status, 200, JSON.stringify(addAdmin.body));
management = addAdmin;

const adminOwnerGrant = await request(
  '/organizations/' +
    organization.id +
    '/managers/' +
    viewer.profileId,
  json(
    'PUT',
    {
      role: 'owner',
      reason: 'Admin must not grant owner',
      expectedManagementRevision:
        management.body.organization.managementRevision,
    },
    admin.bearer,
  ),
);
assert.equal(adminOwnerGrant.response.status, 403);
assert.equal(
  adminOwnerGrant.body.code,
  'ORGANIZATION_MANAGER_ROLE_FORBIDDEN',
);

const finalOwnerRemoval = await request(
  '/organizations/' +
    organization.id +
    '/managers/' +
    owner.profileId,
  json(
    'DELETE',
    {
      reason: 'Final owner guard runtime evidence',
      expectedManagementRevision:
        management.body.organization.managementRevision,
    },
    owner.bearer,
  ),
);
assert.equal(finalOwnerRemoval.response.status, 409);
assert.equal(
  finalOwnerRemoval.body.code,
  'ORGANIZATION_FINAL_OWNER_REQUIRED',
);

const addViewer = await request(
  '/organizations/' +
    organization.id +
    '/managers/' +
    viewer.profileId,
  json(
    'PUT',
    {
      role: 'editor',
      reason: 'Runtime editor delegation',
      expectedManagementRevision:
        management.body.organization.managementRevision,
    },
    owner.bearer,
  ),
);
assert.equal(addViewer.response.status, 200, JSON.stringify(addViewer.body));
management = addViewer;

const postResult = await request(
  '/organizations/' + organization.id + '/posts',
  json(
    'POST',
    {
      title: 'Asamblea Runtime',
      body: 'Información útil para la comunidad universitaria.',
    },
    owner.bearer,
  ),
);
assert.equal(postResult.response.status, 201, JSON.stringify(postResult.body));
const post = postResult.body.post;
assert.match(post.id, UUID_V4);
assert.equal(post.source.kind, 'campus_organization');
assert.equal(post.source.organization.id, organization.id);
assert.equal(post.source.organization.verificationState, 'verified');

const invalidEvent = await request(
  '/organizations/' + organization.id + '/events',
  json(
    'POST',
    {
      title: 'Evento inválido',
      startsAt: '2026-10-02T20:00:00.000Z',
      endsAt: '2026-10-02T19:00:00.000Z',
    },
    admin.bearer,
  ),
);
assert.equal(invalidEvent.response.status, 422);
assert.equal(
  invalidEvent.body.code,
  'ORGANIZATION_EVENT_PERIOD_INVALID',
);

const eventResult = await request(
  '/organizations/' + organization.id + '/events',
  json(
    'POST',
    {
      title: 'Encuentro Runtime',
      description: 'Evento moderable',
      startsAt: '2026-10-02T20:00:00.000Z',
      endsAt: '2026-10-02T21:00:00.000Z',
      externalUrl: 'https://example.test/evento',
    },
    admin.bearer,
  ),
);
assert.equal(eventResult.response.status, 201, JSON.stringify(eventResult.body));
const event = eventResult.body.event;

const beforeFollow = await request(
  '/feeds/for-you?limit=20&mode=community&order=ranked',
  { headers: { authorization: viewer.bearer } },
);
assert.equal(beforeFollow.response.status, 200, JSON.stringify(beforeFollow.body));
assert.equal(
  beforeFollow.body.items.some(
    (item) => item.type === 'organization_post' && item.id === post.id,
  ),
  false,
);

const follow = await request(
  '/organizations/' + organization.id + '/follow',
  { method: 'PUT', headers: { authorization: viewer.bearer } },
);
assert.equal(follow.response.status, 200, JSON.stringify(follow.body));
assert.equal(follow.body.following, true);

const afterFollow = await request(
  '/feeds/for-you?limit=20&mode=community&order=ranked',
  { headers: { authorization: viewer.bearer } },
);
assert.equal(afterFollow.response.status, 200, JSON.stringify(afterFollow.body));
const feedItem = afterFollow.body.items.find(
  (item) => item.type === 'organization_post' && item.id === post.id,
);
assert.ok(feedItem, 'Followed organization post must enter For You');
assert.equal(feedItem.source.kind, 'campus_organization');
assert.equal(feedItem.source.organization.id, organization.id);
assert.equal(feedItem.why.includes('organization_following'), true);
assert.equal(feedItem.why.includes('following'), false);
assert.equal(feedItem.why.includes('connection'), false);

const unfollow = await request(
  '/organizations/' + organization.id + '/follow',
  { method: 'DELETE', headers: { authorization: viewer.bearer } },
);
assert.equal(unfollow.response.status, 200, JSON.stringify(unfollow.body));

const afterUnfollow = await request(
  '/feeds/for-you?limit=20&mode=community&order=ranked',
  { headers: { authorization: viewer.bearer } },
);
assert.equal(afterUnfollow.response.status, 200);
assert.equal(
  afterUnfollow.body.items.some(
    (item) => item.type === 'organization_post' && item.id === post.id,
  ),
  false,
);

const publicResources = await request('/resources?visibility=public&limit=1');
assert.equal(publicResources.response.status, 200);
if (publicResources.body.items.length > 0) {
  const publicResource = publicResources.body.items[0];
  const featured = await request(
    '/organizations/' +
      organization.id +
      '/resources/' +
      publicResource.id,
    { method: 'PUT', headers: { authorization: owner.bearer } },
  );
  assert.equal(featured.response.status, 200, JSON.stringify(featured.body));

  const withResource = await request('/organizations/' + organization.id);
  assert.equal(
    withResource.body.organization.featuredResources.some(
      (resource) => resource.id === publicResource.id,
    ),
    true,
  );

  mongoEval(
    [
      'const id = ' + JSON.stringify(publicResource.id) + ';',
      "const result = db.resources.updateOne({ id }, { $set: { visibility: 'private' } });",
      "if (result.matchedCount !== 1) { printjson(result); quit(2); }",
    ].join('\n'),
  );

  const reauthorized = await request('/organizations/' + organization.id);
  assert.equal(
    reauthorized.body.organization.featuredResources.some(
      (resource) => resource.id === publicResource.id,
    ),
    false,
  );
}

const reportA = await request(
  '/organizations/' + organization.id + '/posts/' + post.id + '/reports',
  json(
    'POST',
    { reason: 'other', details: 'Runtime hide evidence' },
    viewer.bearer,
  ),
);
assert.equal(reportA.response.status, 201, JSON.stringify(reportA.body));

const reportB = await request(
  '/organizations/' + organization.id + '/posts/' + post.id + '/reports',
  json(
    'POST',
    { reason: 'other', details: 'Runtime restore evidence' },
    admin.bearer,
  ),
);
assert.equal(reportB.response.status, 201, JSON.stringify(reportB.body));

const eventReport = await request(
  '/organizations/' + organization.id + '/events/' + event.id + '/reports',
  json(
    'POST',
    { reason: 'other', details: 'Runtime dismiss evidence' },
    viewer.bearer,
  ),
);
assert.equal(
  eventReport.response.status,
  201,
  JSON.stringify(eventReport.body),
);

const queue = await request('/pilot/admin/moderation?status=pending&limit=100', {
  headers: { authorization: operator.bearer },
});
assert.equal(queue.response.status, 200, JSON.stringify(queue.body));
for (const reportId of [
  reportA.body.report.id,
  reportB.body.report.id,
  eventReport.body.report.id,
]) {
  assert.equal(
    queue.body.items.some((item) => item.reportId === reportId),
    true,
  );
}

const hide = await request(
  '/pilot/admin/moderation/organization/' + reportA.body.report.id,
  json(
    'PATCH',
    { action: 'hide', reason: 'Runtime organization hide' },
    operator.bearer,
  ),
);
assert.equal(hide.response.status, 200, JSON.stringify(hide.body));
assert.equal(hide.body.item.targetKind, 'organization_post');
assert.equal(hide.body.item.target.moderationState, 'hidden');

const hiddenPosts = await request(
  '/organizations/' + organization.id + '/posts?limit=20',
);
assert.equal(
  hiddenPosts.body.items.some((item) => item.id === post.id),
  false,
);

const restore = await request(
  '/pilot/admin/moderation/organization/' + reportB.body.report.id,
  json(
    'PATCH',
    { action: 'restore', reason: 'Runtime organization restore' },
    operator.bearer,
  ),
);
assert.equal(restore.response.status, 200, JSON.stringify(restore.body));
assert.equal(restore.body.item.target.moderationState, 'available');

const restoredPosts = await request(
  '/organizations/' + organization.id + '/posts?limit=20',
);
assert.equal(
  restoredPosts.body.items.some((item) => item.id === post.id),
  true,
);

const dismissEvent = await request(
  '/pilot/admin/moderation/organization/' + eventReport.body.report.id,
  json(
    'PATCH',
    { action: 'dismiss', reason: 'Runtime organization dismissal' },
    operator.bearer,
  ),
);
assert.equal(dismissEvent.response.status, 200, JSON.stringify(dismissEvent.body));
assert.equal(dismissEvent.body.item.targetKind, 'organization_event');
assert.equal(dismissEvent.body.item.target.moderationState, 'available');

const auditCount = Number(
  mongoEval(
    [
      'const organizationId = ' + JSON.stringify(organization.id) + ';',
      'print(db.organization_audit.countDocuments({ organizationId }));',
    ].join('\n'),
  ),
);
assert.equal(auditCount >= 4, true);

const moderationAuditCount = Number(
  mongoEval(
    [
      'const ids = ' +
        JSON.stringify([
          reportA.body.report.id,
          reportB.body.report.id,
          eventReport.body.report.id,
        ]) +
        ';',
      "print(db.pilot_moderation_actions.countDocuments({ reportKind: 'organization', reportId: { $in: ids } }));",
    ].join('\n'),
  ),
);
assert.equal(moderationAuditCount, 3);

console.log(
  JSON.stringify({
    event: 'organizations.lifecycle.smoke.ok',
    checks: [
      'canonical-institution-scope',
      'claim-does-not-auto-verify',
      'verification-permission-separated',
      'non-manager-denied',
      'admin-owner-boundary',
      'final-owner-protection',
      'manager-audit',
      'organization-source-attribution',
      'event-period-integrity',
      'explicit-follow-feed-entry',
      'unfollow-removes-feed-entry',
      'manager-relation-not-feed-source',
      'featured-resource-reauthorization',
      'organization-report-queue',
      'moderation-hide-restore-dismiss',
      'moderation-audit',
    ],
  }),
);
