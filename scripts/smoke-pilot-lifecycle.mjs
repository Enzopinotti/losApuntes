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

async function createActor(label) {
  const email =
    ('pilot-' + label + '-' + randomUUID() + '@example.test').toLowerCase();
  const password = 'Pilot runtime ' + randomUUID() + ' ' + randomUUID();

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
    json('POST', { displayName: 'Pilot ' + label }, bearer),
  );
  assert.equal(profile.response.status, 201, JSON.stringify(profile.body));

  const userId = mongoEval(
    [
      'const email = ' + JSON.stringify(email) + ';',
      'const row = db.users.findOne({ email });',
      'if (!row) quit(2);',
      'print(String(row._id));',
    ].join('\n'),
  );

  return {
    email,
    userId,
    bearer,
    profileId: profile.body.profile.id,
  };
}

function setPilotPermissions(actor, enabled) {
  const update = enabled
    ? "{ $addToSet: { platform_permissions: { $each: ['pilot:ops:read', 'moderation:write'] } } }"
    : "{ $pull: { platform_permissions: { $in: ['pilot:ops:read', 'moderation:write'] } } }";

  mongoEval(
    [
      'const email = ' + JSON.stringify(actor.email) + ';',
      'const result = db.users.updateOne({ email }, ' + update + ');',
      "if (result.matchedCount !== 1) { printjson(result); quit(2); }",
    ].join('\n'),
  );
}

const operator = await createActor('Operator');
const reporterA = await createActor('ReporterA');
const reporterB = await createActor('ReporterB');

const subjectSearch = await request(
  '/academic/catalog/search?kind=subject&q=base%20de%20datos&limit=20',
);
assert.equal(subjectSearch.response.status, 200);
const subject = subjectSearch.body.items.find(
  (item) => item.name === 'Base de Datos',
);
assert.ok(subject, 'Academic smoke must create Base de Datos subject');

const forbiddenMetrics = await request('/pilot/admin/metrics?days=14', {
  headers: { authorization: reporterA.bearer },
});
assert.equal(forbiddenMetrics.response.status, 403);
assert.equal(forbiddenMetrics.body.code, 'PILOT_OPS_READ_FORBIDDEN');

setPilotPermissions(operator, true);

const home = await request('/pilot/home', {
  headers: { authorization: reporterA.bearer },
});
assert.equal(home.response.status, 200, JSON.stringify(home.body));
assert.equal(typeof home.body.profileReady, 'boolean');
assert.equal(Array.isArray(home.body.academic.currentSubjectIds), true);
assert.equal(Array.isArray(home.body.academicFeed.items), true);
assert.equal(Array.isArray(home.body.forYou.items), true);
assert.equal(typeof home.body.notifications.unreadCount, 'number');

const searchSentinel = 'pilot-no-result-' + randomUUID();
const emptySearch = await request(
  '/search?q=' +
    encodeURIComponent(searchSentinel) +
    '&scope=all&limit=8',
  { headers: { authorization: reporterA.bearer } },
);
assert.equal(emptySearch.response.status, 200, JSON.stringify(emptySearch.body));
assert.deepEqual(emptySearch.body.results, {
  resources: [],
  subjects: [],
  people: [],
});

async function createQuestion(title) {
  const created = await request(
    '/questions',
    json(
      'POST',
      {
        subjectId: subject.id,
        title,
        body: 'Contenido del smoke de moderación Pilot v1.',
      },
      operator.bearer,
    ),
  );
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.match(created.body.question.id, UUID_V4);
  return created.body.question;
}

async function reportQuestion(actor, questionId, details) {
  const reported = await request(
    '/questions/' + questionId + '/reports',
    json(
      'POST',
      {
        reason: 'spam',
        details,
      },
      actor.bearer,
    ),
  );
  assert.equal(reported.response.status, 201, JSON.stringify(reported.body));
  assert.match(reported.body.report.id, UUID_V4);
  return reported.body.report;
}

const reversibleQuestion = await createQuestion(
  'Pilot moderation reversible target',
);
const hideReport = await reportQuestion(
  reporterA,
  reversibleQuestion.id,
  'Hide review runtime evidence',
);
const restoreReport = await reportQuestion(
  reporterB,
  reversibleQuestion.id,
  'Restore review runtime evidence',
);

const dismissQuestion = await createQuestion('Pilot moderation dismiss target');
const dismissReport = await reportQuestion(
  reporterA,
  dismissQuestion.id,
  'Dismiss review runtime evidence',
);

const queue = await request('/pilot/admin/moderation?status=pending&limit=50', {
  headers: { authorization: operator.bearer },
});
assert.equal(queue.response.status, 200, JSON.stringify(queue.body));
for (const reportId of [
  hideReport.id,
  restoreReport.id,
  dismissReport.id,
]) {
  assert.equal(
    queue.body.items.some((item) => item.reportId === reportId),
    true,
    'Pending moderation queue must include ' + reportId,
  );
}

const hide = await request(
  '/pilot/admin/moderation/qa/' + hideReport.id,
  json(
    'PATCH',
    {
      action: 'hide',
      reason: 'Verified smoke hide decision',
    },
    operator.bearer,
  ),
);
assert.equal(hide.response.status, 200, JSON.stringify(hide.body));
assert.equal(hide.body.item.status, 'resolved');
assert.equal(hide.body.item.action, 'hide');
assert.equal(hide.body.item.target.moderationState, 'hidden');

const hiddenRead = await request('/questions/' + reversibleQuestion.id);
assert.equal(hiddenRead.response.status, 404);

const replay = await request(
  '/pilot/admin/moderation/qa/' + hideReport.id,
  json(
    'PATCH',
    {
      action: 'dismiss',
      reason: 'Replay must fail',
    },
    operator.bearer,
  ),
);
assert.equal(replay.response.status, 409);
assert.equal(replay.body.code, 'PILOT_REPORT_ALREADY_REVIEWED');

const restore = await request(
  '/pilot/admin/moderation/qa/' + restoreReport.id,
  json(
    'PATCH',
    {
      action: 'restore',
      reason: 'Verified smoke restore decision',
    },
    operator.bearer,
  ),
);
assert.equal(restore.response.status, 200, JSON.stringify(restore.body));
assert.equal(restore.body.item.status, 'resolved');
assert.equal(restore.body.item.target.moderationState, 'available');

const restoredRead = await request('/questions/' + reversibleQuestion.id);
assert.equal(restoredRead.response.status, 200);

const dismissed = await request(
  '/pilot/admin/moderation/qa/' + dismissReport.id,
  json(
    'PATCH',
    {
      action: 'dismiss',
      reason: 'Verified smoke dismissal',
    },
    operator.bearer,
  ),
);
assert.equal(dismissed.response.status, 200, JSON.stringify(dismissed.body));
assert.equal(dismissed.body.item.status, 'dismissed');
assert.equal(dismissed.body.item.target.moderationState, 'available');

const dismissTargetRead = await request('/questions/' + dismissQuestion.id);
assert.equal(dismissTargetRead.response.status, 200);

const metrics = await request('/pilot/admin/metrics?days=14', {
  headers: { authorization: operator.bearer },
});
assert.equal(metrics.response.status, 200, JSON.stringify(metrics.body));
assert.equal(metrics.body.window.days, 14);
assert.equal(metrics.body.search.searches >= 1, true);
assert.equal(metrics.body.search.noResultSearches >= 1, true);
assert.equal(metrics.body.activity.activeUsers >= 1, true);
assert.equal(metrics.body.contributions.events >= 2, true);
assert.equal(
  metrics.body.subjects.some(
    (row) =>
      row.subjectId === subject.id &&
      row.contributionEvents >= 2,
  ),
  true,
);
assert.equal(metrics.body.moderation.reviewedInWindow >= 3, true);

const auditCount = Number(
  mongoEval(
    [
      'const ids = ' +
        JSON.stringify([hideReport.id, restoreReport.id, dismissReport.id]) +
        ';',
      'print(db.pilot_moderation_actions.countDocuments({ reportId: { $in: ids } }));',
    ].join('\n'),
  ),
);
assert.equal(auditCount, 3);

const telemetryLeak = mongoEval(
  [
    'const sentinel = ' + JSON.stringify(searchSentinel) + ';',
    'const rows = db.pilot_events.find({ userId: ' +
      JSON.stringify(reporterA.userId) +
      ' }).toArray();',
    'const serialized = JSON.stringify(rows);',
    'print(serialized.includes(sentinel) ? "LEAK" : "SAFE");',
  ].join('\n'),
);
assert.equal(telemetryLeak, 'SAFE');

const noResultEventCount = Number(
  mongoEval(
    [
      'const userId = ' + JSON.stringify(reporterA.userId) + ';',
      "print(db.pilot_events.countDocuments({ userId, event: 'pilot.search_performed', resultCount: 0 }));",
    ].join('\n'),
  ),
);
assert.equal(noResultEventCount >= 1, true);

const homeEventCount = Number(
  mongoEval(
    [
      'const userId = ' + JSON.stringify(reporterA.userId) + ';',
      "print(db.pilot_events.countDocuments({ userId, event: 'pilot.home_viewed' }));",
    ].join('\n'),
  ),
);
assert.equal(homeEventCount >= 1, true);

setPilotPermissions(operator, false);

console.log(
  JSON.stringify({
    event: 'pilot.lifecycle.smoke.ok',
    checks: [
      'operator-deny-by-default',
      'contextual-home',
      'search-no-result-event',
      'query-text-not-stored',
      'moderation-queue',
      'moderation-hide',
      'hidden-target-fail-closed',
      'moderation-replay-conflict',
      'moderation-restore',
      'moderation-dismiss',
      'durable-moderation-audit',
      'pilot-metrics',
      'subject-density',
    ],
  }),
);
