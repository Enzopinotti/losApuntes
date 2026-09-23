import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const baseUrl =
  process.env.LOSAPUNTES_SMOKE_BASE_URL ?? 'http://127.0.0.1:4000';
const REQUEST_TIMEOUT_MS = 8_000;
const VIEWER_EMAIL = 'runtime-smoke@example.test';
const VIEWER_PASSWORD = 'runtime-smoke-authenticated-change-2026';

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

async function createAuthor() {
  const email =
    'feeds-author-' + randomUUID().toLowerCase() + '@example.test';
  const password = 'Feeds smoke ' + randomUUID() + ' ' + randomUUID();

  const registration = await request(
    '/auth/register',
    json('POST', { email, password }),
  );
  assert.equal(registration.response.status, 202);

  mongoEval(
    [
      'const result = db.users.updateOne({ email: ' +
        JSON.stringify(email) +
        ' }, { $set: { email_verified_at: new Date() } });',
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
    json('POST', { displayName: 'Feeds Runtime Author' }, bearer),
  );
  assert.equal(profile.response.status, 201, JSON.stringify(profile.body));

  return { bearer, profileId: profile.body.profile.id };
}

const viewerLogin = await request(
  '/auth/mobile/login',
  json('POST', { email: VIEWER_EMAIL, password: VIEWER_PASSWORD }),
);
assert.equal(viewerLogin.response.status, 200, JSON.stringify(viewerLogin.body));
const viewerBearer = 'Bearer ' + viewerLogin.body.sessionToken;

const viewerProfile = await request('/profile/me', {
  headers: { authorization: viewerBearer },
});
assert.equal(viewerProfile.response.status, 200);
if (viewerProfile.body.onboardingRequired) {
  const created = await request(
    '/profile/me',
    json('POST', { displayName: 'Feeds Runtime Viewer' }, viewerBearer),
  );
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
}

const subjectSearch = await request(
  '/academic/catalog/search?kind=subject&q=base%20de%20datos&limit=20',
);
assert.equal(subjectSearch.response.status, 200);
const subject = subjectSearch.body.items.find(
  (item) => item.name === 'Base de Datos',
);
assert.ok(subject, 'Academic smoke must create Base de Datos subject');

const author = await createAuthor();
const questionIds = [];

for (let index = 0; index < 8; index += 1) {
  const created = await request(
    '/questions',
    json(
      'POST',
      {
        subjectId: subject.id,
        title: 'Pregunta Feed Runtime ' + index,
        body:
          'Consulta de feed para validar ranking académico y corte natural ' +
          index,
      },
      author.bearer,
    ),
  );
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  questionIds.push(created.body.question.id);
}

const hiddenId = questionIds.at(-1);
assert.ok(hiddenId);
mongoEval(
  [
    'const id = ' + JSON.stringify(hiddenId) + ';',
    "const result = db.questions.updateOne({ id }, { $set: { moderationState: 'hidden' } });",
    "if (result.matchedCount !== 1) { printjson(result); quit(2); }",
  ].join('\n'),
);

const initialPreferences = await request('/feeds/preferences', {
  headers: { authorization: viewerBearer },
});
assert.equal(initialPreferences.response.status, 200);
assert.equal(initialPreferences.body.preferences.useAcademic, true);
assert.equal(initialPreferences.body.preferences.useSocial, true);
assert.equal(initialPreferences.body.preferences.useInterests, true);
const initialRevision = initialPreferences.body.preferences.revision;

const academicPage = await request('/feeds/academic?limit=2', {
  headers: { authorization: viewerBearer },
});
assert.equal(academicPage.response.status, 200, JSON.stringify(academicPage.body));
assert.equal(academicPage.body.items.length, 2);
assert.equal(typeof academicPage.body.nextCursor, 'string');
assert.equal(
  academicPage.body.items.every(
    (item) =>
      item.academic.subject.id === subject.id &&
      item.why.includes('current_subject') &&
      item.id !== hiddenId,
  ),
  true,
);

const rankedPage = await request(
  '/feeds/for-you?limit=2&mode=study&order=ranked',
  { headers: { authorization: viewerBearer } },
);
assert.equal(rankedPage.response.status, 200, JSON.stringify(rankedPage.body));
assert.equal(rankedPage.body.items.length, 2);
assert.equal(typeof rankedPage.body.nextCursor, 'string');
assert.equal(rankedPage.body.effectiveSignals.academic, true);
assert.equal(
  rankedPage.body.items.every(
    (item) =>
      item.why.includes('current_subject') &&
      item.why.includes('unanswered_question') &&
      item.id !== hiddenId,
  ),
  true,
);

const target = rankedPage.body.items[0];
const feedback = await request(
  '/feeds/feedback/' + target.type + '/' + target.id,
  json('PUT', { signal: 'more' }, viewerBearer),
);
assert.equal(feedback.response.status, 200, JSON.stringify(feedback.body));
assert.equal(feedback.body.changed, true);
assert.equal(feedback.body.revision, initialRevision + 1);

const staleCursor = await request(
  '/feeds/for-you?limit=2&mode=study&order=ranked&cursor=' +
    encodeURIComponent(rankedPage.body.nextCursor),
  { headers: { authorization: viewerBearer } },
);
assert.equal(staleCursor.response.status, 409);
assert.equal(staleCursor.body.code, 'FEED_CURSOR_STALE');

const hiddenFeedback = await request(
  '/feeds/feedback/question/' + hiddenId,
  json('PUT', { signal: 'more' }, viewerBearer),
);
assert.equal(hiddenFeedback.response.status, 404);
assert.equal(hiddenFeedback.body.code, 'FEED_FEEDBACK_TARGET_NOT_FOUND');

const afterFeedbackPreferences = await request('/feeds/preferences', {
  headers: { authorization: viewerBearer },
});
assert.equal(afterFeedbackPreferences.response.status, 200);

const prioritized = await request(
  '/feeds/preferences',
  json(
    'PATCH',
    {
      expectedRevision: afterFeedbackPreferences.body.preferences.revision,
      prioritizedSubjectIds: [subject.id],
    },
    viewerBearer,
  ),
);
assert.equal(prioritized.response.status, 200, JSON.stringify(prioritized.body));
assert.deepEqual(prioritized.body.preferences.prioritizedSubjectIds, [
  subject.id,
]);

const first = await request('/feeds/for-you?limit=2&mode=study&order=ranked', {
  headers: { authorization: viewerBearer },
});
assert.equal(first.response.status, 200);
assert.equal(typeof first.body.nextCursor, 'string');

const second = await request(
  '/feeds/for-you?limit=2&mode=study&order=ranked&cursor=' +
    encodeURIComponent(first.body.nextCursor),
  { headers: { authorization: viewerBearer } },
);
assert.equal(second.response.status, 200);
assert.equal(typeof second.body.nextCursor, 'string');

const third = await request(
  '/feeds/for-you?limit=2&mode=study&order=ranked&cursor=' +
    encodeURIComponent(second.body.nextCursor),
  { headers: { authorization: viewerBearer } },
);
assert.equal(third.response.status, 200);
assert.equal(third.body.items.length, 2);
assert.equal(third.body.nextCursor, null);
assert.equal(third.body.stopReason, 'natural_break');

const chronological = await request(
  '/feeds/for-you?limit=2&mode=balanced&order=chronological',
  { headers: { authorization: viewerBearer } },
);
assert.equal(chronological.response.status, 200);
assert.equal(chronological.body.items.length, 2);

const currentPreferences = await request('/feeds/preferences', {
  headers: { authorization: viewerBearer },
});
const muted = await request(
  '/feeds/preferences',
  json(
    'PATCH',
    {
      expectedRevision: currentPreferences.body.preferences.revision,
      mutedSubjectIds: [subject.id],
    },
    viewerBearer,
  ),
);
assert.equal(muted.response.status, 200);

const academicMuted = await request('/feeds/academic?limit=10', {
  headers: { authorization: viewerBearer },
});
assert.equal(academicMuted.response.status, 200);
assert.deepEqual(academicMuted.body.items, []);
assert.equal(academicMuted.body.stopReason, 'end');

console.log(
  JSON.stringify({
    event: 'feeds.lifecycle.smoke.ok',
    checks: [
      'academic-current-subject-feed',
      'hidden-source-excluded',
      'transparent-reason-codes',
      'for-you-effective-academic-signal',
      'unanswered-question-boost',
      'feedback-revision',
      'stale-cursor-after-feedback',
      'hidden-target-feedback-denied',
      'prioritized-subject-control',
      'chronological-option',
      'three-page-natural-break',
      'muted-subject-exclusion',
    ],
  }),
);
