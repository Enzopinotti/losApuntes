import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const baseUrl =
  process.env.LOSAPUNTES_SMOKE_BASE_URL ?? 'http://127.0.0.1:4000';
const REQUEST_TIMEOUT_MS = 5_000;
const EMAIL = `search-smoke-${randomUUID()}@example.test`;
const PASSWORD = `Search runtime ${randomUUID()} ${randomUUID()}`;

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

const anonymousContext = await request('/discovery/contextual');
assert.equal(anonymousContext.response.status, 401);

const staleCredential = await request(
  '/search?q=base%20de%20datos&scope=subjects&limit=8',
  { headers: { authorization: 'Bearer invalid-runtime-session' } },
);
assert.equal(
  staleCredential.response.status,
  401,
  'Presented invalid credentials must not silently downgrade to anonymous',
);

const subjectSearch = await request(
  '/search?q=base%20de%20datos&scope=subjects&limit=8',
);
assert.equal(subjectSearch.response.status, 200);
assert.equal(subjectSearch.body.scope, 'subjects');
assert.deepEqual(subjectSearch.body.results.resources, []);
assert.deepEqual(subjectSearch.body.results.people, []);
const subject = subjectSearch.body.results.subjects.find(
  (item) => item.name === 'Base de Datos',
);
assert.ok(subject, 'Academic smoke must expose Base de Datos');

const peopleSearch = await request(
  '/search?q=runtime%20student&scope=people&limit=8',
);
assert.equal(peopleSearch.response.status, 200);
assert.equal(
  peopleSearch.body.results.people.some(
    (person) => person.displayName === 'Runtime Student',
  ),
  true,
  'Profile smoke must leave one public Runtime Student profile',
);
assert.equal(JSON.stringify(peopleSearch.body).includes('careerDiscoveryOptIn'), false);
assert.equal(JSON.stringify(peopleSearch.body).includes('recommendationSignals'), false);

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

const participation = await request(
  `/academic/me/subjects/${subject.id}`,
  json(
    'PUT',
    {
      state: 'current',
      periodLabel: '2026 S2',
    },
    bearer,
  ),
);
assert.equal(participation.response.status, 200, JSON.stringify(participation.body));

const contextual = await request(
  '/discovery/contextual?subjectLimit=4&resourcesPerSubject=3',
  { headers: { authorization: bearer } },
);
assert.equal(contextual.response.status, 200);
assert.equal(
  contextual.body.subjects.some(
    (bucket) =>
      bucket.subject.id === subject.id &&
      bucket.subject.name === 'Base de Datos',
  ),
  true,
);

const allSearch = await request('/search?q=base%20de%20datos&scope=all&limit=8', {
  headers: { authorization: bearer },
});
assert.equal(allSearch.response.status, 200);
assert.equal(Array.isArray(allSearch.body.results.resources), true);
assert.equal(Array.isArray(allSearch.body.results.subjects), true);
assert.equal(Array.isArray(allSearch.body.results.people), true);
assert.equal('score' in allSearch.body, false);

console.log(
  JSON.stringify({
    event: 'search.discovery.lifecycle.smoke.ok',
    checks: [
      'anonymous-global-search',
      'invalid-session-fails-closed',
      'canonical-subject-search',
      'public-profile-search',
      'private-profile-fields-not-leaked',
      'contextual-auth-required',
      'current-subject-contextual-discovery',
      'grouped-no-cross-type-score',
    ],
  }),
);
