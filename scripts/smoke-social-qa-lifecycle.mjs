import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const baseUrl =
  process.env.LOSAPUNTES_SMOKE_BASE_URL ?? 'http://127.0.0.1:4000';
const REQUEST_TIMEOUT_MS = 7_500;
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
  const email = `social-qa-${label}-${randomUUID()}@example.test`;
  const password = `Social QA runtime ${randomUUID()} ${randomUUID()}`;

  const registration = await request(
    '/auth/register',
    json('POST', { email, password }),
  );
  assert.equal(registration.response.status, 202);

  mongoEval(
    [
      `const email = ${JSON.stringify(email)};`,
      'const result = db.users.updateOne({ email }, { $set: { email_verified_at: new Date() } });',
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
    json(
      'POST',
      {
        displayName: `Runtime ${label}`,
      },
      bearer,
    ),
  );
  assert.equal(profile.response.status, 201, JSON.stringify(profile.body));
  assert.match(profile.body.profile.id, UUID_V4);

  const userId = mongoEval(
    [
      `const email = ${JSON.stringify(email)};`,
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

async function academicNode(kind, q, expectedName) {
  const result = await request(
    `/academic/catalog/search?kind=${encodeURIComponent(
      kind,
    )}&q=${encodeURIComponent(q)}&limit=20`,
  );
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  const node = result.body.items.find((item) => item.name === expectedName);
  assert.ok(node, `Missing academic node: ${expectedName}`);
  return node;
}

async function attachAcademicContext(actor, nodes) {
  const affiliation = await request(
    '/academic/me/affiliations',
    json(
      'POST',
      {
        institutionId: nodes.institution.id,
        programId: nodes.program.id,
        curriculumId: nodes.curriculum.id,
        status: 'active',
        startedOn: '2026',
      },
      actor.bearer,
    ),
  );
  assert.equal(affiliation.response.status, 201, JSON.stringify(affiliation.body));

  const participation = await request(
    `/academic/me/subjects/${nodes.subject.id}`,
    json(
      'PUT',
      {
        courseOfferingId: nodes.offering.id,
        state: 'current',
        periodLabel: '2026 S2',
      },
      actor.bearer,
    ),
  );
  assert.equal(participation.response.status, 200);

  const context = await request(
    '/academic/me/context',
    json(
      'PUT',
      {
        affiliationId: affiliation.body.affiliation.id,
        subjectParticipationId: participation.body.participation.id,
      },
      actor.bearer,
    ),
  );
  assert.equal(context.response.status, 200);
}

async function notifications(actor) {
  const result = await request('/notifications?unreadOnly=false&limit=100', {
    headers: { authorization: actor.bearer },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.items;
}

const nodes = {
  institution: await academicNode(
    'institution',
    'Universidad Runtime Smoke',
    'Universidad Runtime Smoke',
  ),
  program: await academicNode(
    'program',
    'Ingeniería Runtime',
    'Ingeniería Runtime',
  ),
  curriculum: await academicNode('curriculum', 'Plan 2026', 'Plan 2026'),
  subject: await academicNode('subject', 'Base de Datos', 'Base de Datos'),
  offering: await academicNode(
    'course_offering',
    'Base de Datos 2026 S2',
    'Base de Datos · 2026 S2',
  ),
};

const alice = await createActor('Alice');
const bruno = await createActor('Bruno');
const carla = await createActor('Carla');

await attachAcademicContext(alice, nodes);
await attachAcademicContext(bruno, nodes);

const noImplicitConnection = await request('/social/me/connections?limit=100', {
  headers: { authorization: alice.bearer },
});
assert.equal(noImplicitConnection.response.status, 200);
assert.equal(
  noImplicitConnection.body.items.length,
  0,
  'Shared academic context must not create a social connection',
);

const followFirst = await request(
  `/social/profiles/${bruno.profileId}/follow`,
  {
    method: 'PUT',
    headers: { authorization: alice.bearer },
  },
);
assert.equal(followFirst.response.status, 200);
assert.deepEqual(followFirst.body, { following: true });

const followAgain = await request(
  `/social/profiles/${bruno.profileId}/follow`,
  {
    method: 'PUT',
    headers: { authorization: alice.bearer },
  },
);
assert.equal(followAgain.response.status, 200);

const following = await request('/social/me/following?limit=100', {
  headers: { authorization: alice.bearer },
});
assert.equal(following.response.status, 200);
assert.equal(
  following.body.items.filter(
    (item) => item.profile.profileId === bruno.profileId,
  ).length,
  1,
);

const brunoAfterFollow = await notifications(bruno);
assert.equal(
  brunoAfterFollow.filter((item) => item.type === 'social.followed').length,
  1,
  'Idempotent follow must create one notification',
);

const stillNoConnection = await request('/social/me/connections?limit=100', {
  headers: { authorization: alice.bearer },
});
assert.equal(stillNoConnection.response.status, 200);
assert.equal(stillNoConnection.body.items.length, 0);

const connectionRequest = await request(
  `/social/profiles/${bruno.profileId}/connections`,
  {
    method: 'POST',
    headers: { authorization: alice.bearer },
  },
);
assert.equal(
  connectionRequest.response.status,
  201,
  JSON.stringify(connectionRequest.body),
);
const connectionId = connectionRequest.body.connection.id;
assert.match(connectionId, UUID_V4);
assert.equal(connectionRequest.body.connection.status, 'pending');
assert.equal(connectionRequest.body.connection.requestedByMe, true);

const reverseWhilePending = await request(
  `/social/profiles/${alice.profileId}/connections`,
  {
    method: 'POST',
    headers: { authorization: bruno.bearer },
  },
);
assert.equal(reverseWhilePending.response.status, 201);
assert.equal(reverseWhilePending.body.connection.id, connectionId);
assert.equal(reverseWhilePending.body.connection.incoming, true);

const pairCount = Number(
  mongoEval(
    [
      `const a = ${JSON.stringify(alice.userId)};`,
      `const b = ${JSON.stringify(bruno.userId)};`,
      'const low = a < b ? a : b;',
      'const high = a < b ? b : a;',
      'print(db.social_connections.countDocuments({ userLowId: low, userHighId: high }));',
    ].join('\n'),
  ),
);
assert.equal(pairCount, 1, 'Unordered pair must have one Connection row');

const requesterAccept = await request(
  `/social/connections/${connectionId}/accept`,
  {
    method: 'POST',
    headers: { authorization: alice.bearer },
  },
);
assert.equal(requesterAccept.response.status, 422);
assert.equal(
  requesterAccept.body.code,
  'SOCIAL_CONNECTION_RECIPIENT_REQUIRED',
);

const outsiderAccept = await request(
  `/social/connections/${connectionId}/accept`,
  {
    method: 'POST',
    headers: { authorization: carla.bearer },
  },
);
assert.equal(outsiderAccept.response.status, 404);

const accepted = await request(
  `/social/connections/${connectionId}/accept`,
  {
    method: 'POST',
    headers: { authorization: bruno.bearer },
  },
);
assert.equal(accepted.response.status, 201);
assert.equal(accepted.body.connection.status, 'accepted');

const aliceNotifications = await notifications(alice);
const acceptedNotification = aliceNotifications.find(
  (item) => item.type === 'social.connection_accepted',
);
assert.ok(acceptedNotification);

const outsiderRead = await request(
  `/notifications/${acceptedNotification.id}/read`,
  {
    method: 'PATCH',
    headers: { authorization: carla.bearer },
  },
);
assert.equal(outsiderRead.response.status, 404);

const markRead = await request(
  `/notifications/${acceptedNotification.id}/read`,
  {
    method: 'PATCH',
    headers: { authorization: alice.bearer },
  },
);
assert.equal(markRead.response.status, 200);
assert.deepEqual(markRead.body, { read: true });

const disconnected = await request(
  `/social/connections/${connectionId}`,
  {
    method: 'DELETE',
    headers: { authorization: alice.bearer },
  },
);
assert.equal(disconnected.response.status, 200);

const reopened = await request(
  `/social/profiles/${alice.profileId}/connections`,
  {
    method: 'POST',
    headers: { authorization: bruno.bearer },
  },
);
assert.equal(reopened.response.status, 201);
assert.equal(reopened.body.connection.id, connectionId);
assert.equal(reopened.body.connection.status, 'pending');
assert.equal(reopened.body.connection.requestedByMe, true);

const declined = await request(
  `/social/connections/${connectionId}/decline`,
  {
    method: 'POST',
    headers: { authorization: alice.bearer },
  },
);
assert.equal(declined.response.status, 201);
assert.equal(declined.body.connection.status, 'declined');

const questionCreate = await request(
  '/questions',
  json(
    'POST',
    {
      subjectId: nodes.subject.id,
      courseOfferingId: nodes.offering.id,
      title: '¿Cómo verifico una dependencia transitiva?',
      body: 'Necesito entender cómo detectar una dependencia transitiva al normalizar.',
    },
    alice.bearer,
  ),
);
assert.equal(questionCreate.response.status, 201, JSON.stringify(questionCreate.body));
const questionId = questionCreate.body.question.id;
assert.match(questionId, UUID_V4);
assert.equal(questionCreate.body.question.academic.subject.id, nodes.subject.id);

const anonymousQuestion = await request(`/questions/${questionId}`);
assert.equal(anonymousQuestion.response.status, 200);
assert.equal(anonymousQuestion.body.question.viewer.canAnswer, false);

const questionSearch = await request(
  `/questions?q=${encodeURIComponent('dependencia transitiva')}&subjectId=${nodes.subject.id}&status=open&limit=20`,
);
assert.equal(questionSearch.response.status, 200);
assert.equal(
  questionSearch.body.items.some((item) => item.id === questionId),
  true,
);

const closeQuestion = await request(
  `/questions/${questionId}`,
  json(
    'PATCH',
    {
      expectedRevision: questionCreate.body.question.revision,
      status: 'closed',
    },
    alice.bearer,
  ),
);
assert.equal(closeQuestion.response.status, 200);
assert.equal(closeQuestion.body.question.state, 'closed');

const closedAnswer = await request(
  `/questions/${questionId}/answers`,
  json(
    'POST',
    { body: 'No debería poder publicarse con la pregunta cerrada.' },
    bruno.bearer,
  ),
);
assert.equal(closedAnswer.response.status, 409);
assert.equal(closedAnswer.body.code, 'QUESTION_CLOSED');

const reopenQuestion = await request(
  `/questions/${questionId}`,
  json(
    'PATCH',
    {
      expectedRevision: closeQuestion.body.question.revision,
      status: 'open',
    },
    alice.bearer,
  ),
);
assert.equal(reopenQuestion.response.status, 200);
assert.equal(reopenQuestion.body.question.state, 'open');

const answerCreate = await request(
  `/questions/${questionId}/answers`,
  json(
    'POST',
    {
      body: 'Buscá una dependencia A → B y otra B → C que implique A → C.',
    },
    bruno.bearer,
  ),
);
assert.equal(answerCreate.response.status, 201, JSON.stringify(answerCreate.body));
const answerId = answerCreate.body.answer.id;
assert.match(answerId, UUID_V4);

const afterAnswerNotifications = await notifications(alice);
const answeredNotification = afterAnswerNotifications.find(
  (item) =>
    item.type === 'qa.question_answered' && item.target.id === questionId,
);
assert.ok(answeredNotification);

const answerUpdate = await request(
  `/answers/${answerId}`,
  json(
    'PATCH',
    {
      expectedRevision: answerCreate.body.answer.revision,
      body: 'Buscá A → B y B → C; si A determina C transitivamente, separá la relación.',
    },
    bruno.bearer,
  ),
);
assert.equal(answerUpdate.response.status, 200);
assert.equal(answerUpdate.body.answer.revision, 2);

const secondQuestion = await request(
  '/questions',
  json(
    'POST',
    {
      subjectId: nodes.subject.id,
      title: '¿Qué diferencia hay entre 2FN y 3FN?',
      body: 'Quiero separar correctamente dependencias parciales y transitivas.',
    },
    alice.bearer,
  ),
);
assert.equal(secondQuestion.response.status, 201);

const wrongQuestionAccept = await request(
  `/questions/${secondQuestion.body.question.id}/answers/${answerId}/accept`,
  json(
    'POST',
    { expectedRevision: secondQuestion.body.question.revision },
    alice.bearer,
  ),
);
assert.equal(wrongQuestionAccept.response.status, 422);
assert.equal(wrongQuestionAccept.body.code, 'ANSWER_QUESTION_MISMATCH');

const detailBeforeAccept = await request(`/questions/${questionId}`, {
  headers: { authorization: alice.bearer },
});
assert.equal(detailBeforeAccept.response.status, 200);
const acceptAnswer = await request(
  `/questions/${questionId}/answers/${answerId}/accept`,
  json(
    'POST',
    { expectedRevision: detailBeforeAccept.body.question.revision },
    alice.bearer,
  ),
);
assert.equal(acceptAnswer.response.status, 201);
assert.equal(acceptAnswer.body.question.acceptedAnswerId, answerId);

const brunoNotifications = await notifications(bruno);
assert.equal(
  brunoNotifications.some(
    (item) =>
      item.type === 'qa.answer_accepted' && item.target.id === questionId,
  ),
  true,
);

const firstReport = await request(
  `/questions/${questionId}/reports`,
  json(
    'POST',
    {
      reason: 'other',
      details: 'Runtime report',
    },
    carla.bearer,
  ),
);
assert.equal(firstReport.response.status, 201);
const secondReport = await request(
  `/questions/${questionId}/reports`,
  json(
    'POST',
    {
      reason: 'other',
      details: 'Runtime report repeated',
    },
    carla.bearer,
  ),
);
assert.equal(secondReport.response.status, 201);
assert.equal(secondReport.body.report.id, firstReport.body.report.id);

const answerReport = await request(
  `/answers/${answerId}/reports`,
  json(
    'POST',
    {
      reason: 'misinformation',
      details: 'Runtime answer report',
    },
    carla.bearer,
  ),
);
assert.equal(answerReport.response.status, 201);

mongoEval(
  [
    `const id = ${JSON.stringify(answerId)};`,
    "const result = db.answers.updateOne({ id }, { $set: { moderationState: 'hidden' } });",
    "if (result.matchedCount !== 1) { printjson(result); quit(2); }",
  ].join('\n'),
);

const hiddenAnswerDetail = await request(`/questions/${questionId}`);
assert.equal(hiddenAnswerDetail.response.status, 200);
assert.equal(
  hiddenAnswerDetail.body.answers.some((item) => item.id === answerId),
  false,
);

mongoEval(
  [
    `const id = ${JSON.stringify(questionId)};`,
    "const result = db.questions.updateOne({ id }, { $set: { moderationState: 'hidden' } });",
    "if (result.matchedCount !== 1) { printjson(result); quit(2); }",
  ].join('\n'),
);

const hiddenQuestion = await request(`/questions/${questionId}`);
assert.equal(hiddenQuestion.response.status, 404);

const markAllRead = await request('/notifications/read-all', {
  method: 'POST',
  headers: { authorization: alice.bearer },
});
assert.equal(markAllRead.response.status, 201);
assert.equal(Number.isInteger(markAllRead.body.updated), true);

console.log(
  JSON.stringify({
    event: 'social.qa.lifecycle.smoke.ok',
    checks: [
      'shared-academic-context-does-not-connect',
      'follow-idempotency',
      'follow-does-not-connect',
      'connection-pair-uniqueness',
      'requester-cannot-self-accept',
      'outsider-connection-deny',
      'recipient-accept',
      'notification-ownership',
      'disconnect-reopen-same-relation',
      'decline-without-acceptance-notification',
      'canonical-question-context',
      'anonymous-question-read',
      'bounded-question-search',
      'closed-question-rejects-answer',
      'answer-edit',
      'answer-question-membership',
      'accepted-answer-notification',
      'report-idempotency',
      'answer-report',
      'hidden-answer-fail-closed',
      'hidden-question-fail-closed',
      'notification-read-all',
    ],
  }),
);
