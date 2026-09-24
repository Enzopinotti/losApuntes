import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) =>
  readFile(path.join(root, relativePath), 'utf8');

const service = await read(
  'apps/web/src/features/organizations/services/organizationsService.ts',
);
assert.match(service, /credentials:\s*"include"/u);
assert.match(service, /cache:\s*"no-store"/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);

const routes = await read('apps/web/src/app/routes.tsx');
assert.match(
  routes,
  /\{\s*path:\s*"organizations",\s*element:\s*<Organizations\s*\/>\s*\}/u,
);
assert.match(
  routes,
  /\{\s*path:\s*"organizations\/:organizationId",\s*element:\s*<Organization\s*\/>\s*\}/u,
);
assert.match(
  routes,
  /path:\s*"organizations\/:organizationId\/manage"[\s\S]*?<PrivateRoute>[\s\S]*?<OrganizationManage\s*\/>[\s\S]*?<\/PrivateRoute>/u,
);

const publicPage = await read('apps/web/src/pages/Organization.tsx');
assert.match(publicPage, /organizationsApi\.get\(/u);
assert.match(publicPage, /verificationState/u);
assert.doesNotMatch(publicPage, /actorUserId|createdByUserId/u);

const manage = await read('apps/web/src/pages/OrganizationManage.tsx');
assert.match(manage, /organizationsApi\.management\(/u);
assert.match(manage, /managementRevision/u);
assert.match(manage, /updateVerification/u);

const feeds = await read('apps/web/src/pages/Feeds.tsx');
assert.match(feeds, /organization_following/u);
assert.match(feeds, /campus_organization/u);
assert.match(feeds, /Ver organización/u);

console.log('PASS Web Organizations authority/source contract');
