import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  shouldReconcileNotificationTick,
} from '../apps/web/src/features/community/notificationReconciliation.ts';

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
assert.match(service, /cursor/u);
assert.match(service, /questions/u);
assert.match(service, /\/questions\/\$\{encodeURIComponent\(questionId\)\}\/answers/u);
assert.match(service, /notifications/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);

const network = await read('apps/web/src/pages/Network.tsx');
assert.match(network, /searchApi\.search/u);
assert.match(network, /scope:\s*"people"/u);
assert.match(network, /communityApi\.follow/u);
assert.match(network, /communityApi\.requestConnection/u);
assert.match(network, /communityApi\.respondConnection/u);
assert.match(network, /loadMoreFollowing/u);
assert.match(network, /loadMoreConnections/u);
assert.doesNotMatch(network, /academic.*connect|auto.*connect/iu);
assert.doesNotMatch(network, /localStorage|sessionStorage/u);

const questions = await read('apps/web/src/pages/Questions.tsx');
assert.match(questions, /communityApi\.questions/u);
assert.match(questions, /communityApi\.createQuestion/u);
assert.match(questions, /communityApi\.createAnswer/u);
assert.match(questions, /communityApi\.acceptAnswer/u);
assert.match(questions, /resourcesApi\.searchSubjects/u);
assert.match(questions, /nextCursor/u);
assert.match(questions, /questions-more/u);
assert.match(questions, /communityApi\.answers/u);
assert.match(questions, /answersNextCursor/u);
assert.match(questions, /answers-more/u);
assert.match(questions, /appendAnswers/u);
assert.match(questions, /Cargar más respuestas/u);
assert.doesNotMatch(questions, /localStorage|sessionStorage/u);

const notifications = await read('apps/web/src/pages/Notifications.tsx');
const notificationReconciliation = {
  authenticated: true,
  firstPagePending: false,
  loading: false,
  loadingMore: false,
  actionBusy: false,
};
let consumedReconcileTick = 0;
const consumeReconcileTick = (tick, state) => {
  if (
    !shouldReconcileNotificationTick(tick, consumedReconcileTick, state)
  ) {
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
assert.match(
  notifications,
  /setActionBusy\(false\);\s*setLoadingMore\(false\);\s*\}, \[authorityScope\]/u,
);
assert.doesNotMatch(
  notifications,
  /await\s+load\(undefined,\s*false,\s*true\)/u,
  'stale mutation continuations must not invoke a captured list loader',
);
assert.doesNotMatch(notifications, /localStorage|sessionStorage/u);

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
