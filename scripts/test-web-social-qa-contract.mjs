import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
assert.doesNotMatch(questions, /localStorage|sessionStorage/u);

const notifications = await read('apps/web/src/pages/Notifications.tsx');
assert.match(notifications, /communityApi\.notifications/u);
assert.match(notifications, /communityApi\.markNotificationRead/u);
assert.match(notifications, /communityApi\.markAllNotificationsRead/u);
assert.match(notifications, /nextCursor/u);
assert.match(notifications, /Cargar más/u);

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
