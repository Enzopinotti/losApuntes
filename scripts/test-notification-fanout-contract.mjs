import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [fanout, service, socialStore, qaStore] = await Promise.all([
  read('apps/api/src/notifications/domain/notification-fanout.ts'),
  read('apps/api/src/notifications/domain/notification.service.ts'),
  read('apps/api/src/social/mongo/mongo-social.store.ts'),
  read('apps/api/src/qa/mongo/mongo-qa.store.ts'),
]);

assert.match(fanout, /MAX_NOTIFICATION_SYNC_RECIPIENTS\s*=\s*50/u);
assert.match(fanout, /MAX_NOTIFICATION_SYNC_RECORDS\s*=\s*50/u);
assert.match(fanout, /NOTIFICATION_FANOUT_BUDGET_EXCEEDED/u);

assert.match(service, /assertNotificationFanoutBudget\(records\)/u);
assert.match(service, /store\.createMany\(records\)/u);

assert.match(socialStore, /assertNotificationFanoutBudget/u);
assert.match(
  socialStore,
  /assertNotificationFanoutBudget\(\[input\.notification\]\)/u,
);

assert.match(qaStore, /assertNotificationFanoutBudget/u);
assert.match(
  qaStore,
  /assertNotificationFanoutBudget\(\[input\.notification\]\)/u,
);

console.log('PASS Notification fan-out budget contract');
