import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const baseUrl =
  process.env.LOSAPUNTES_SMOKE_BASE_URL ?? 'http://127.0.0.1:4000';
const REQUEST_TIMEOUT_MS = 8_000;
const EMAIL = 'runtime-smoke@example.test';
const PASSWORD = 'runtime-smoke-authenticated-change-2026';

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

  return { response, body };
}

function json(method, value, bearer) {
  return {
    method,
    headers: {
      'content-type': 'application/json',
      ...(bearer ? { authorization: bearer } : {}),
    },
    body: JSON.stringify(value),
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

const login = await request(
  '/auth/mobile/login',
  json('POST', { email: EMAIL, password: PASSWORD }),
);
assert.equal(login.response.status, 200, JSON.stringify(login.body));
const bearer = 'Bearer ' + login.body.sessionToken;

const programSearch = await request(
  '/academic/catalog/search?kind=program&q=ingenier%C3%ADa%20runtime&limit=20',
);
assert.equal(programSearch.response.status, 200, JSON.stringify(programSearch.body));
const program = programSearch.body.items.find(
  (item) => item.name === 'Ingeniería Runtime',
);
assert.ok(program, 'Academic smoke must create Ingeniería Runtime');

const institutionSearch = await request(
  '/academic/catalog/search?kind=institution&q=universidad%20runtime%20smoke&limit=20',
);
assert.equal(
  institutionSearch.response.status,
  200,
  JSON.stringify(institutionSearch.body),
);
const institution = institutionSearch.body.items.find(
  (item) => item.name === 'Universidad Runtime Smoke',
);
assert.ok(institution, 'Academic smoke must create Universidad Runtime Smoke');

const affiliations = await request('/academic/me/affiliations', {
  headers: { authorization: bearer },
});
assert.equal(affiliations.response.status, 200, JSON.stringify(affiliations.body));
const targetAffiliation = affiliations.body.affiliations.find(
  (row) => row.programId === program.id && row.status === 'active',
);
assert.ok(targetAffiliation, 'Runtime student affiliation must exist');

const before = await request('/academic/me/lifecycle', {
  headers: { authorization: bearer },
});
assert.equal(before.response.status, 200, JSON.stringify(before.body));
assert.equal(
  before.body.activeStudentAffiliationIds.includes(targetAffiliation.id),
  true,
);
assert.equal(before.body.currentSubjectIds.length > 0, true);
assert.equal(before.body.hasCurrentSubjectContext, true);

const roles = await request(
  '/academic/me/affiliations/' + targetAffiliation.id + '/roles',
  json(
    'PATCH',
    {
      roles: ['advanced_student', 'mentor'],
    },
    bearer,
  ),
);
assert.equal(roles.response.status, 200, JSON.stringify(roles.body));
assert.deepEqual(
  [...roles.body.affiliation.roles].sort(),
  ['advanced_student', 'mentor'].sort(),
);

const bypass = await request(
  '/academic/me/affiliations/' + targetAffiliation.id + '/status',
  json(
    'PATCH',
    {
      status: 'alumni',
      endedOn: '2026-09',
    },
    bearer,
  ),
);
assert.equal(bypass.response.status, 422, JSON.stringify(bypass.body));
assert.equal(bypass.body.code, 'ACADEMIC_GRADUATION_TRANSITION_REQUIRED');

const followInstitution = await request(
  '/academic/me/follows/' + institution.id,
  {
    method: 'PUT',
    headers: { authorization: bearer },
  },
);
assert.equal(
  followInstitution.response.status,
  200,
  JSON.stringify(followInstitution.body),
);
assert.equal(followInstitution.body.target.kind, 'institution');

const followProgram = await request('/academic/me/follows/' + program.id, {
  method: 'PUT',
  headers: { authorization: bearer },
});
assert.equal(followProgram.response.status, 200, JSON.stringify(followProgram.body));
assert.equal(followProgram.body.target.kind, 'program');

const follows = await request('/academic/me/follows', {
  headers: { authorization: bearer },
});
assert.equal(follows.response.status, 200, JSON.stringify(follows.body));
assert.equal(
  follows.body.follows.some((row) => row.targetId === institution.id),
  true,
);
assert.equal(
  follows.body.follows.some((row) => row.targetId === program.id),
  true,
);

const graduated = await request(
  '/academic/me/affiliations/' + targetAffiliation.id + '/graduate',
  json(
    'POST',
    {
      graduatedOn: '2026-09',
    },
    bearer,
  ),
);
assert.equal(graduated.response.status, 201, JSON.stringify(graduated.body));
assert.equal(graduated.body.affiliation.id, targetAffiliation.id);
assert.equal(graduated.body.affiliation.status, 'alumni');
assert.equal(
  graduated.body.affiliation.roles.includes('advanced_student'),
  false,
);
assert.equal(graduated.body.affiliation.roles.includes('mentor'), true);
assert.equal(graduated.body.affiliation.roles.includes('recent_graduate'), true);
assert.equal(graduated.body.affiliation.roles.includes('alumni'), true);
assert.equal(graduated.body.transitionedSubjectCount >= 1, true);

const repeated = await request(
  '/academic/me/affiliations/' + targetAffiliation.id + '/graduate',
  json(
    'POST',
    {
      graduatedOn: '2026-09',
    },
    bearer,
  ),
);
assert.equal(repeated.response.status, 201, JSON.stringify(repeated.body));
assert.equal(repeated.body.affiliation.id, targetAffiliation.id);
assert.equal(repeated.body.affiliation.status, 'alumni');
assert.equal(repeated.body.transitionedSubjectCount, 0);

const lifecycle = await request('/academic/me/lifecycle', {
  headers: { authorization: bearer },
});
assert.equal(lifecycle.response.status, 200, JSON.stringify(lifecycle.body));
assert.equal(
  lifecycle.body.alumniAffiliationIds.includes(targetAffiliation.id),
  true,
);
assert.equal(lifecycle.body.currentSubjectIds.length, 0);
assert.equal(lifecycle.body.hasCurrentSubjectContext, false);
assert.equal(['alumni', 'mixed'].includes(lifecycle.body.phase), true);

const affiliationsAfterFirstGraduation = await request(
  '/academic/me/affiliations',
  {
    headers: { authorization: bearer },
  },
);
assert.equal(
  affiliationsAfterFirstGraduation.response.status,
  200,
  JSON.stringify(affiliationsAfterFirstGraduation.body),
);

const remainingStudentAffiliations =
  affiliationsAfterFirstGraduation.body.affiliations.filter(
    (row) =>
      row.id !== targetAffiliation.id &&
      (row.status === 'active' || row.status === 'paused'),
  );

for (const remainingAffiliation of remainingStudentAffiliations) {
  const remainingGraduation = await request(
    '/academic/me/affiliations/' + remainingAffiliation.id + '/graduate',
    json(
      'POST',
      {
        graduatedOn: '2026-09',
      },
      bearer,
    ),
  );
  assert.equal(
    remainingGraduation.response.status,
    201,
    JSON.stringify(remainingGraduation.body),
  );
  assert.equal(remainingGraduation.body.affiliation.status, 'alumni');
}

const alumniOnlyLifecycle = await request('/academic/me/lifecycle', {
  headers: { authorization: bearer },
});
assert.equal(
  alumniOnlyLifecycle.response.status,
  200,
  JSON.stringify(alumniOnlyLifecycle.body),
);
assert.equal(alumniOnlyLifecycle.body.phase, 'alumni');
assert.equal(alumniOnlyLifecycle.body.activeStudentAffiliationIds.length, 0);
assert.equal(
  alumniOnlyLifecycle.body.alumniAffiliationIds.includes(targetAffiliation.id),
  true,
);

const context = await request('/academic/me/context', {
  headers: { authorization: bearer },
});
assert.equal(context.response.status, 200, JSON.stringify(context.body));
assert.equal(context.body.context.affiliationId, targetAffiliation.id);
assert.equal('subjectParticipationId' in context.body.context, false);

const subjects = await request('/academic/me/subjects', {
  headers: { authorization: bearer },
});
assert.equal(subjects.response.status, 200, JSON.stringify(subjects.body));
assert.equal(
  subjects.body.participations.every((row) => row.state !== 'current'),
  true,
);

const invalidStudentRole = await request(
  '/academic/me/affiliations/' + targetAffiliation.id + '/roles',
  json(
    'PATCH',
    {
      roles: ['student'],
    },
    bearer,
  ),
);
assert.equal(
  invalidStudentRole.response.status,
  422,
  JSON.stringify(invalidStudentRole.body),
);
assert.equal(
  invalidStudentRole.body.code,
  'ACADEMIC_AFFILIATION_ROLE_INVALID',
);

const home = await request('/pilot/home', {
  headers: { authorization: bearer },
});
assert.equal(home.response.status, 200, JSON.stringify(home.body));
assert.equal(home.body.academic.currentSubjectIds.length, 0);
assert.equal(home.body.homeFeed.kind, 'community');
assert.equal(Array.isArray(home.body.homeFeed.items), true);
assert.equal(Array.isArray(home.body.forYou.items), true);

mongoEval(
  [
    'const email = ' + JSON.stringify(EMAIL) + ';',
    "const result = db.users.updateOne({ email }, { $addToSet: { platform_permissions: 'pilot:ops:read' } });",
    "if (result.matchedCount !== 1) { printjson(result); quit(2); }",
  ].join('\n'),
);

const metrics = await request('/pilot/admin/metrics?days=14', {
  headers: { authorization: bearer },
});
assert.equal(metrics.response.status, 200, JSON.stringify(metrics.body));
assert.equal(typeof metrics.body.audience.activeStudents.activeUsers, 'number');
assert.equal(typeof metrics.body.audience.alumni.activeUsers, 'number');
assert.equal(metrics.body.audience.alumni.activeUsers >= 1, true);

const auditCount = Number(
  mongoEval(
    [
      "const count = db.academic_audit_events.countDocuments({ event: 'academic.affiliation.graduated' });",
      'print(count);',
    ].join('\n'),
  ),
);
assert.equal(Number.isFinite(auditCount), true);
assert.equal(auditCount >= 1, true);

const unfollowProgram = await request('/academic/me/follows/' + program.id, {
  method: 'DELETE',
  headers: { authorization: bearer },
});
assert.equal(unfollowProgram.response.status, 200);

const followsAfterDelete = await request('/academic/me/follows', {
  headers: { authorization: bearer },
});
assert.equal(followsAfterDelete.response.status, 200);
assert.equal(
  followsAfterDelete.body.follows.some((row) => row.targetId === program.id),
  false,
);

console.log(
  JSON.stringify({
    event: 'alumni.lifecycle.smoke.ok',
    checks: [
      'student-lifecycle-before-graduation',
      'multi-role-update',
      'generic-status-bypass-rejected',
      'institution-program-follows',
      'graduation-preserves-affiliation-id',
      'graduation-completes-current-subjects',
      'graduation-clears-subject-context',
      'graduation-idempotent',
      'mixed-lifecycle-preserved',
      'remaining-student-affiliations-graduated',
      'alumni-only-lifecycle-before-cohort-metrics',
      'student-role-rejected-after-graduation',
      'alumni-community-home-continuity',
      'for-you-remains-separate',
      'alumni-cohort-metrics',
      'durable-graduation-audit',
      'follow-delete',
    ],
  }),
);
