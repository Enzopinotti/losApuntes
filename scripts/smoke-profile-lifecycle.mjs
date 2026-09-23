import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const baseUrl =
  process.env.LOSAPUNTES_SMOKE_BASE_URL ?? 'http://127.0.0.1:4000';
const REQUEST_TIMEOUT_MS = 5_000;
const EMAIL = `profile-smoke-${randomUUID()}@example.test`;
const PASSWORD = `Profile runtime ${randomUUID()} ${randomUUID()}`;
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

const registration = await request(
  '/auth/register',
  json('POST', { email: EMAIL, password: PASSWORD }),
);
assert.equal(registration.response.status, 202);

const verificationScript = [
  `const result = db.users.updateOne({ email: ${JSON.stringify(
    EMAIL,
  )} }, { $set: { email_verified_at: new Date() } });`,
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
    verificationScript,
  ],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
);

const login = await request(
  '/auth/mobile/login',
  json('POST', { email: EMAIL, password: PASSWORD }),
);
assert.equal(login.response.status, 200);
const bearer = `Bearer ${login.body.sessionToken}`;

const before = await request('/profile/me', {
  headers: { authorization: bearer },
});
assert.equal(before.response.status, 200);
assert.equal(before.body.profile, null);
assert.equal(before.body.onboardingRequired, true);

const created = await request(
  '/profile/me',
  json(
    'POST',
    {
      displayName: ' Runtime   Student ',
      bio: 'Perfil de prueba del runtime',
      skills: ['SQL', 'sql', ' TypeScript '],
      interests: ['datos'],
      professional: {
        headline: 'Estudiante de ingeniería',
        careerDiscoveryOptIn: true,
      },
    },
    bearer,
  ),
);
assert.equal(created.response.status, 201, JSON.stringify(created.body));
assert.match(created.body.profile.id, UUID_V4);
assert.equal(created.body.profile.displayName, 'Runtime Student');
assert.deepEqual(created.body.profile.skills, ['SQL', 'TypeScript']);
assert.equal(created.body.profile.visibility.academic, 'private');
const profileId = created.body.profile.id;

const duplicate = await request(
  '/profile/me',
  json('POST', { displayName: 'Duplicado' }, bearer),
);
assert.equal(duplicate.response.status, 409);
assert.equal(duplicate.body.code, 'PROFILE_ALREADY_EXISTS');

const owner = await request('/profile/me', {
  headers: { authorization: bearer },
});
assert.equal(owner.response.status, 200);
assert.equal(owner.body.onboardingRequired, false);
assert.equal(Array.isArray(owner.body.academic.affiliations), true);
assert.equal(Array.isArray(owner.body.activities), true);

const publicDefault = await request(`/profiles/${profileId}`);
assert.equal(publicDefault.response.status, 200);
assert.equal(publicDefault.body.profile.about.displayName, 'Runtime Student');
assert.equal('academic' in publicDefault.body.profile, false);
assert.equal('skills' in publicDefault.body.profile, false);
assert.equal('professional' in publicDefault.body.profile, false);
assert.equal('recommendationSignals' in publicDefault.body.profile, false);

const invalidOrder = await request(
  '/profile/me',
  json(
    'PATCH',
    {
      expectedRevision: created.body.profile.revision,
      presentation: { sectionOrder: ['about', 'academic'] },
    },
    bearer,
  ),
);
assert.equal(invalidOrder.response.status, 422);
assert.equal(invalidOrder.body.code, 'PROFILE_SECTION_ORDER_INVALID');

const updated = await request(
  '/profile/me',
  json(
    'PATCH',
    {
      expectedRevision: created.body.profile.revision,
      visibility: {
        academic: 'public',
        skills: 'public',
        professional: 'public',
      },
      recommendationSignals: {
        skillsInterests: false,
      },
    },
    bearer,
  ),
);
assert.equal(updated.response.status, 200);
assert.equal(updated.body.profile.revision, created.body.profile.revision + 1);

const stale = await request(
  '/profile/me',
  json(
    'PATCH',
    {
      expectedRevision: created.body.profile.revision,
      bio: 'stale',
    },
    bearer,
  ),
);
assert.equal(stale.response.status, 409);
assert.equal(stale.body.code, 'PROFILE_REVISION_CONFLICT');

const invalidPeriod = await request(
  '/profile/me/activities',
  json(
    'POST',
    {
      type: 'project',
      title: 'Período inválido',
      startedOn: '2026-09',
      endedOn: '2026-01',
    },
    bearer,
  ),
);
assert.equal(invalidPeriod.response.status, 422);
assert.equal(invalidPeriod.body.code, 'PROFILE_ACTIVITY_PERIOD_INVALID');

const activity = await request(
  '/profile/me/activities',
  json(
    'POST',
    {
      type: 'project',
      title: ' Proyecto   integrador ',
      description: 'Prueba de Profile v1',
      startedOn: '2026-01',
      endedOn: '2026-09',
    },
    bearer,
  ),
);
assert.equal(activity.response.status, 201, JSON.stringify(activity.body));
assert.match(activity.body.activity.id, UUID_V4);
assert.equal(activity.body.activity.title, 'Proyecto integrador');

const publicAfter = await request(`/profiles/${profileId}`);
assert.equal(publicAfter.response.status, 200);
assert.equal(Array.isArray(publicAfter.body.profile.academic.affiliations), true);
assert.deepEqual(publicAfter.body.profile.skills.skills, ['SQL', 'TypeScript']);
assert.equal(
  publicAfter.body.profile.professional.headline,
  'Estudiante de ingeniería',
);
assert.equal(
  'careerDiscoveryOptIn' in publicAfter.body.profile.professional,
  false,
);
assert.equal('recommendationSignals' in publicAfter.body.profile, false);

const activityUpdated = await request(
  `/profile/me/activities/${activity.body.activity.id}`,
  json(
    'PATCH',
    {
      expectedRevision: activity.body.activity.revision,
      title: 'Proyecto integrador final',
    },
    bearer,
  ),
);
assert.equal(activityUpdated.response.status, 200);
assert.equal(activityUpdated.body.activity.revision, 2);

const staleActivity = await request(
  `/profile/me/activities/${activity.body.activity.id}`,
  json(
    'PATCH',
    {
      expectedRevision: 1,
      title: 'Stale',
    },
    bearer,
  ),
);
assert.equal(staleActivity.response.status, 409);
assert.equal(staleActivity.body.code, 'PROFILE_ACTIVITY_REVISION_CONFLICT');

const deleted = await request(
  `/profile/me/activities/${activity.body.activity.id}?expectedRevision=2`,
  {
    method: 'DELETE',
    headers: { authorization: bearer },
  },
);
assert.equal(deleted.response.status, 200);

console.log(
  JSON.stringify({
    event: 'profile.lifecycle.smoke.ok',
    checks: [
      'onboarding-required',
      'profile-create',
      'duplicate-create-conflict',
      'owner-academic-composition',
      'privacy-default-fail-closed',
      'section-order-validation',
      'optimistic-profile-revision',
      'public-section-projection',
      'career-opt-in-not-publicly-leaked',
      'activity-period-validation',
      'activity-create-update-delete',
      'optimistic-activity-revision',
    ],
  }),
);
