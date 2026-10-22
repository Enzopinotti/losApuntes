import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { shouldReconcileNotificationTick } from '../apps/web/src/features/community/notificationReconciliation.ts';
import { notificationTargetPath } from '../apps/web/src/features/community/notification-navigation.mjs';
import {
  notificationCategoryForType,
  notificationCategoryCounts,
  selectNotificationCategory,
  NOTIFICATION_CATEGORIES,
} from '../apps/web/src/features/community/notification-category.mjs';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const service = await read(
  'apps/web/src/features/community/services/communityService.ts',
);
assert.match(service, /credentials:\s*"include"/u);
assert.match(service, /cache:\s*"no-store"/u);
assert.match(service, /AbortSignal\.timeout\(15_000\)/u);
assert.match(service, /social\/me\/connections/u);
assert.match(service, /following:[\s\S]*signal\?: AbortSignal/u);
assert.match(service, /connections:[\s\S]*signal\?: AbortSignal/u);
assert.match(service, /requestConnection:[\s\S]*signal\?: AbortSignal/u);
assert.match(service, /respondConnection:[\s\S]*signal\?: AbortSignal/u);
assert.match(service, /disconnect:[\s\S]*signal\?: AbortSignal/u);
assert.match(service, /cursor/u);
assert.match(service, /questions/u);
assert.match(
  service,
  /\/questions\/\$\{encodeURIComponent\(questionId\)\}\/answers/u,
);
assert.match(service, /questions:[\s\S]{0,260}signal\?: AbortSignal/u);
assert.match(service, /question: \(id: string, signal\?: AbortSignal\)/u);
assert.match(service, /answers:[\s\S]{0,220}signal\?: AbortSignal/u);
assert.match(service, /createQuestion:[\s\S]{0,220}signal\?: AbortSignal/u);
assert.match(service, /updateQuestion:[\s\S]{0,320}signal\?: AbortSignal/u);
assert.match(service, /createAnswer:[\s\S]{0,180}signal\?: AbortSignal/u);
assert.match(service, /updateAnswer:[\s\S]{0,180}signal\?: AbortSignal/u);
assert.match(service, /acceptAnswer:[\s\S]{0,220}signal\?: AbortSignal/u);
assert.match(service, /reportQuestion: \(id: string, signal\?: AbortSignal\)/u);
assert.match(service, /reportAnswer: \(id: string, signal\?: AbortSignal\)/u);
assert.match(service, /notifications/u);
assert.match(
  service,
  /markNotificationRead: \(id: string, signal\?: AbortSignal\)/u,
);
assert.match(service, /markAllNotificationsRead: \(signal\?: AbortSignal\)/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);

const network = await read('apps/web/src/pages/Network.tsx');
assert.match(network, /searchApi\.search/u);
assert.match(network, /useAuth\(\)/u);
assert.match(network, /user\?\.id/u);
assert.match(network, /session\?\.id/u);
assert.equal((network.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 3);
assert.match(network, /network-load:\$\{authScopeKey\}/u);
assert.match(network, /network-action:\$\{authScopeKey\}/u);
assert.match(network, /network-search:\$\{searchScopeKey\}/u);
assert.match(
  network,
  /communityApi\.following\(50, undefined, ticket\.signal\)/u,
);
assert.match(
  network,
  /communityApi\.connections\(undefined, 50, undefined, ticket\.signal\)/u,
);
assert.match(network, /await loadRef\.current\(\)/u);
assert.match(network, /searchApi\.search\([\s\S]*ticket\.signal/u);
assert.match(network, /snapshotState\?\.scopeKey === authScopeKey/u);
assert.match(network, /searchState\?\.scopeKey === searchScopeKey/u);
assert.match(network, /scope:\s*"people"/u);
assert.match(network, /communityApi\.follow/u);
assert.match(network, /communityApi\.requestConnection/u);
assert.match(network, /communityApi\.respondConnection/u);
assert.match(network, /loadMoreFollowing/u);
assert.match(network, /loadMoreConnections/u);
assert.doesNotMatch(network, /academic.*connect|auto.*connect/iu);
assert.doesNotMatch(network, /localStorage|sessionStorage/u);

const questions = await read('apps/web/src/pages/Questions.tsx');
const communityStyles = await read('apps/web/src/pages/Community.scss');
assert.match(questions, /useAuth\(\)/u);
assert.match(questions, /user\?\.id/u);
assert.match(questions, /session\?\.id/u);
assert.equal((questions.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 4);
assert.match(questions, /questions-list:\$\{listScopeKey\}/u);
assert.match(questions, /questions-detail:\$\{detailScopeKey\}/u);
assert.match(
  questions,
  /questions-subject-search:\$\{subjectSearchScopeKey\}/u,
);
assert.match(questions, /questions-action:\$\{actionScopeKey\}/u);
assert.match(questions, /listState\?\.scopeKey === listScopeKey/u);
assert.match(questions, /detailState\?\.scopeKey === detailScopeKey/u);
assert.match(
  questions,
  /subjectSearchState\?\.scopeKey === subjectSearchScopeKey/u,
);
assert.match(questions, /actionState\?\.scopeKey === actionScopeKey/u);
assert.match(
  questions,
  /communityApi\.questions\([\s\S]{0,420}ticket\.signal/u,
);
assert.match(
  questions,
  /communityApi\s*\.\s*question\s*\(\s*initialId,\s*ticket\.signal\s*\)/u,
);
assert.match(questions, /communityApi\.answers\([\s\S]{0,260}ticket\.signal/u);
assert.match(
  questions,
  /resourcesApi\s*\.\s*searchSubjects\s*\(\s*q,\s*ticket\.signal\s*\)/u,
);
assert.match(questions, /communityApi\.createQuestion\([\s\S]{0,300}signal/u);
assert.match(questions, /communityApi\.createAnswer\([\s\S]{0,180}signal/u);
assert.match(questions, /communityApi\.updateQuestion\([\s\S]{0,180}signal/u);
assert.match(questions, /communityApi\.updateAnswer\([\s\S]{0,180}signal/u);
assert.match(questions, /communityApi\.acceptAnswer\([\s\S]{0,180}signal/u);
assert.match(questions, /communityApi\.reportQuestion\([\s\S]{0,160}signal/u);
assert.match(questions, /communityApi\.reportAnswer\([\s\S]{0,160}signal/u);
assert.match(questions, /await loadListRef\.current\(\)/u);
assert.match(questions, /loadDetailRef\.current\(\)/u);
assert.match(questions, /setSearchParams\(\{ id: result\.question\.id \}\)/u);
assert.match(questions, /Cargando pregunta…/u);
assert.match(questions, /feedReturnHref\(location\.state\)/u);
assert.match(
  questions,
  /className="community-back-link"[\s\S]{0,180}to=\{feedReturnTo\}[\s\S]{0,100}replace/u,
);
assert.match(
  questions,
  /feedReturnTo === "\/"[\s\S]{0,120}Volver a Inicio[\s\S]{0,80}Volver al feed/u,
);
assert.match(communityStyles, /\.community-back-link:focus-visible/u);
assert.match(questions, /nextCursor/u);
assert.match(questions, /questions-more/u);
assert.match(questions, /answersNextCursor/u);
assert.match(questions, /answers-more/u);
assert.match(questions, /appendAnswers/u);
assert.match(questions, /Cargar más respuestas/u);
assert.match(questions, /function CommunityAuthorAttribution/u);
assert.match(questions, /profileId\.trim\(\) !== profileId/u);
assert.match(
  questions,
  /to=\{`\/p\/\$\{encodeURIComponent\(profileId\)\}`\}/u,
);
assert.match(questions, /aria-label=\{`Ver perfil de \$\{displayName\}`\}/u);
assert.equal(
  (
    questions.match(
      /<CommunityAuthorAttribution[\s\S]{0,80}author=\{(?:selected\.question|answer)\.author\}/gu,
    ) ?? []
  ).length,
  2,
);
assert.match(communityStyles, /\.community-author-link:focus-visible/u);
assert.doesNotMatch(questions, /localStorage|sessionStorage/u);

const fakeAlerts = [
  { id: 'q-answer', type: 'qa.question_answered', readAt: null },
  { id: 'network-request', type: 'social.connection_requested', readAt: null },
  { id: 'q-accepted', type: 'qa.answer_accepted', readAt: '2026-10-19T10:00:00Z' },
  { id: 'follow', type: 'social.followed', readAt: null },
  { id: 'connection', type: 'social.connection_accepted', readAt: null },
  { id: 'unknown', type: 'future.event', readAt: null },
];
assert.deepEqual(NOTIFICATION_CATEGORIES, ['all', 'study', 'network']);
assert.equal(notificationCategoryForType('qa.question_answered'), 'study');
assert.equal(notificationCategoryForType('qa.answer_accepted'), 'study');
assert.equal(notificationCategoryForType('social.followed'), 'network');
assert.equal(notificationCategoryForType('social.connection_requested'), 'network');
assert.equal(notificationCategoryForType('social.connection_accepted'), 'network');
assert.equal(notificationCategoryForType('future.event'), null);
assert.equal(notificationCategoryForType(null), null);
assert.deepEqual(
  selectNotificationCategory(fakeAlerts, 'study').map((item) => item.id),
  ['q-answer', 'q-accepted'],
);
assert.deepEqual(
  selectNotificationCategory(fakeAlerts, 'network').map((item) => item.id),
  ['network-request', 'follow', 'connection'],
);
assert.deepEqual(selectNotificationCategory(fakeAlerts, 'all'), fakeAlerts);
assert.deepEqual(selectNotificationCategory(fakeAlerts, 'invalid'), []);
assert.deepEqual(selectNotificationCategory(null, 'study'), []);
assert.deepEqual(notificationCategoryCounts(fakeAlerts), {
  all: 6,
  study: 2,
  network: 3,
});
assert.deepEqual(notificationCategoryCounts([]), {
  all: 0,
  study: 0,
  network: 0,
});
assert.deepEqual(
  selectNotificationCategory(fakeAlerts.filter((item) => !item.readAt), 'study')
    .map((item) => item.id),
  ['q-answer'],
  'Local topic and server-side unread filters compose without changing read state',
);

const notifications = await read('apps/web/src/pages/Notifications.tsx');
assert.match(notifications, /setCategory\("all"\)/u);
assert.match(notifications, /selectNotificationCategory\(items, category\)/u);
assert.match(notifications, /notificationCategoryCounts\(items\)/u);
assert.match(notifications, /visibleItems\.map\(\(item\)/u);
assert.match(notifications, /aria-pressed=\{category === "study"\}/u);
assert.match(notifications, /aria-pressed=\{category === "network"\}/u);
assert.match(notifications, /Los números corresponden solo a las páginas cargadas/u);
assert.match(notifications, /Marcar todas\s+como leídas afecta la bandeja completa/u);
assert.match(notifications, /visibleItems\.length === 0/u);
assert.match(notifications, /Podés cargar más para consultar/u);
assert.match(notifications, /nextCursor &&/u);
assert.match(notifications, /labels\[item\.type\]\s*\?\?/u);
const notificationStyles = await read('apps/web/src/pages/Community.scss');
assert.match(notificationStyles, /\.community-notification-categories/u);
assert.match(
  notificationStyles,
  /\.community-notification-category-options button:focus-visible/u,
);
assert.match(notifications, /useLayoutEffect/u);
assert.match(
  notifications,
  /previousAuthorityScopeRef\.current === authorityScope/u,
);
assert.match(notifications, /setItems\(\[\]\);[\s\S]*setNextCursor\(null\)/u);
assert.match(notifications, /setUnreadOnly\(false\)/u);
assert.match(
  notifications,
  /setLoadingMore\(false\);[\s\S]*setActionBusy\(false\)/u,
);
assert.match(notifications, /setOpeningState\(null\);[\s\S]*setError\(null\)/u);
assert.match(notifications, /window\.scrollTo\(0, 0\)/u);
const notificationReconciliation = {
  authenticated: true,
  firstPagePending: false,
  loading: false,
  loadingMore: false,
  actionBusy: false,
};
let consumedReconcileTick = 0;
const consumeReconcileTick = (tick, state) => {
  if (!shouldReconcileNotificationTick(tick, consumedReconcileTick, state)) {
    return false;
  }

  consumedReconcileTick = tick;
  return true;
};

assert.equal(
  consumeReconcileTick(1, {
    ...notificationReconciliation,
    firstPagePending: true,
  }),
  false,
);
assert.equal(
  consumedReconcileTick,
  0,
  'a pending first-page load must not consume the tick',
);
assert.equal(consumeReconcileTick(1, notificationReconciliation), true);
assert.equal(
  consumeReconcileTick(1, notificationReconciliation),
  false,
  'a render with changed filter/page dependencies must not replay the same tick',
);
assert.equal(
  consumeReconcileTick(2, { ...notificationReconciliation, loading: true }),
  false,
);
assert.equal(consumeReconcileTick(2, notificationReconciliation), true);
assert.equal(
  shouldReconcileNotificationTick(3, 2, {
    ...notificationReconciliation,
    actionBusy: true,
  }),
  false,
);

assert.match(notifications, /communityApi\.notifications/u);
assert.match(notifications, /communityApi\.markNotificationRead/u);
assert.match(notifications, /communityApi\.markAllNotificationsRead/u);
assert.match(notifications, /notificationTargetPath\(item\.target\)/u);
const acknowledgeAndOpenStart = notifications.indexOf(
  'const acknowledgeAndOpen = async',
);
const acknowledgeAndOpenEnd = notifications.indexOf(
  '\n  return (',
  acknowledgeAndOpenStart,
);
assert.ok(
  acknowledgeAndOpenStart !== -1 &&
    acknowledgeAndOpenEnd > acknowledgeAndOpenStart,
  'Notification opening stays in one explicit acknowledgement flow',
);
const acknowledgeAndOpen = notifications.slice(
  acknowledgeAndOpenStart,
  acknowledgeAndOpenEnd,
);
assert.match(acknowledgeAndOpen, /markNotificationRead\(/u);
assert.match(acknowledgeAndOpen, /item\.id,[\s\S]*ticket\.signal/u);
assert.match(acknowledgeAndOpen, /result\.read !== true/u);
assert.match(
  acknowledgeAndOpen,
  /isActionRequestCurrent\(ticket\)[\s\S]*navigate\(target\)/u,
);
assert.match(notifications, /aria-disabled=\{actionBusy \|\| undefined\}/u);
assert.match(notifications, /Esta notificación no tiene un destino navegable/u);
assert.match(notifications, /nextCursor/u);
assert.match(notifications, /Cargar más/u);
assert.match(notifications, /useAsyncAuthorityFence/u);
assert.match(notifications, /NOTIFICATION_RECONCILE_INTERVAL_MS\s*=\s*30_000/u);
assert.match(notifications, /document\.visibilityState\s*!==\s*"visible"/u);
assert.match(notifications, /window\.setInterval/u);
assert.match(notifications, /visibilitychange/u);
assert.match(notifications, /ticket\.signal/u);
assert.match(notifications, /session\?\.id/u);
assert.match(notifications, /loadedPages/u);
assert.match(notifications, /reconcileLoadedWindow/u);
assert.match(notifications, /setReconcileTick/u);
assert.match(notifications, /setActionBusy\(false\)/u);
assert.match(notifications, /consumedReconcileTickRef/u);
assert.match(notifications, /firstPagePendingRef/u);
assert.match(notifications, /shouldReconcileNotificationTick/u);
assert.doesNotMatch(
  notifications,
  /await\s+load\(undefined,\s*false,\s*true\)/u,
  'stale mutation continuations must not invoke a captured list loader',
);
assert.doesNotMatch(notifications, /localStorage|sessionStorage/u);
assert.equal(
  notificationTargetPath({ type: 'profile', id: 'profile / 1' }),
  '/p/profile%20%2F%201',
);
assert.equal(
  notificationTargetPath({ type: 'question', id: 'question / 1' }),
  '/questions?id=question%20%2F%201',
);
assert.equal(
  notificationTargetPath({ type: 'connection', id: 'connection-1' }),
  '/network',
);
assert.equal(
  notificationTargetPath({ type: 'answer', id: 'answer-1' }),
  null,
  'answer targets without a parent question do not open an unrelated question list',
);
assert.equal(notificationTargetPath(null), null);

const communityService = await read(
  'apps/web/src/features/community/services/communityService.ts',
);
assert.match(communityService, /AbortSignal\.timeout\(15_000\)/u);
assert.match(communityService, /AbortSignal\.any/u);
assert.match(communityService, /notifications:[\s\S]*signal\?: AbortSignal/u);

const routes = await read('apps/web/src/app/routes.tsx');
assert.match(
  routes,
  /\{\s*path:\s*"questions",\s*element:\s*<Questions\s*\/>\s*\}/u,
  'Questions route must remain anonymous-readable',
);
assert.match(
  routes,
  /path:\s*"network"[\s\S]*?<PrivateRoute>[\s\S]*?<Network\s*\/>[\s\S]*?<\/PrivateRoute>/u,
);
assert.match(
  routes,
  /path:\s*"notifications"[\s\S]*?<PrivateRoute>[\s\S]*?<Notifications\s*\/>[\s\S]*?<\/PrivateRoute>/u,
);

console.log('PASS Web Social Q&A privacy/session contract');
