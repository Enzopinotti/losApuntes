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
assert.match(
  service,
  /function requestSignal\(signal\?: AbortSignal \| null\)/u,
);
assert.match(service, /AbortSignal\.any\(\[signal, timeout\]\)/u);
assert.match(service, /signal: requestSignal\(init\.signal\)/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);
assert.match(service, /posts:\s*\(id:\s*string, cursor\?/u);
assert.match(service, /events:\s*\(id:\s*string, cursor\?/u);
assert.match(service, /archive:\s*\(/u);
assert.match(service, /\/organizations\/\$\{encodeURIComponent\(id\)\}\/archive/u);
assert.match(service, /expectedManagementRevision/u);
assert.match(service, /nextCursor:\s*string\s*\|\s*null/u);

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

const directory = await read('apps/web/src/pages/Organizations.tsx');
assert.match(directory, /useAsyncAuthorityFence/u);
assert.equal((directory.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 3);
assert.match(directory, /user\?\.id/u);
assert.match(directory, /session\?\.id/u);
assert.match(directory, /directoryScopeKey/u);
assert.match(directory, /institutionSearchScopeKey/u);
assert.match(directory, /ticket\.signal/u);
assert.match(directory, /await loadRef\.current\(\)/u);
assert.match(directory, /setInstitutionSelection\(\{\s*authScopeKey/u);

const publicPage = await read('apps/web/src/pages/Organization.tsx');
assert.match(publicPage, /organizationsApi\.get\(/u);
assert.match(publicPage, /useAsyncAuthorityFence/u);
assert.equal((publicPage.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 2);
assert.match(publicPage, /organizationScopeKey/u);
assert.match(publicPage, /user\?\.id/u);
assert.match(publicPage, /session\?\.id/u);
assert.match(publicPage, /ticket\.signal/u);
assert.match(publicPage, /verificationState/u);
assert.match(publicPage, /organizationsApi\.posts\(/u);
assert.match(publicPage, /organizationsApi\.events\(/u);
assert.match(publicPage, /postsNextCursor/u);
assert.match(publicPage, /eventsNextCursor/u);
assert.match(publicPage, /appendPosts/u);
assert.match(publicPage, /appendEvents/u);
assert.match(publicPage, /Cargar más publicaciones/u);
assert.match(publicPage, /Cargar más eventos/u);
assert.doesNotMatch(publicPage, /actorUserId|createdByUserId/u);

const manage = await read('apps/web/src/pages/OrganizationManage.tsx');
assert.match(manage, /organizationsApi\.management\(/u);
assert.match(manage, /managementRevision/u);
assert.match(manage, /updateVerification/u);
assert.match(manage, /useAsyncAuthorityFence/u);
assert.equal((manage.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 2);
assert.match(manage, /organizationScopeKey/u);
assert.match(manage, /user\?\.id/u);
assert.match(manage, /session\?\.id/u);
assert.match(manage, /operation: \(signal: AbortSignal\)/u);
assert.match(manage, /return isActionCurrent\(ticket\)/u);
assert.match(manage, /if \(!succeeded\) return/u);
assert.match(manage, /setPostTitle\(""\)/u);
assert.match(manage, /ConfirmDialog/u);
assert.match(manage, /management\.actorRole !== "owner"/u);
assert.match(manage, /organizationsApi\.archive\(/u);
assert.match(manage, /Archivar organización/u);
assert.match(manage, /Esta acción no es un borrado/u);
assert.match(manage, /navigate\("\/organizations", \{ replace: true \}\)/u);
assert.doesNotMatch(manage, /organizationsApi\.deleteOrganization/u);
assert.match(manage, /if \(busy === "archive"\) return false;/u);
assert.equal(
  [...manage.matchAll(/<button disabled=\{Boolean\(busy\)\} type="submit">/gu)]
    .length,
  3,
);
assert.match(manage, /\}, \[organizationScopeKey\]\);/u);

const feeds = await read('apps/web/src/pages/Feeds.tsx');
assert.match(feeds, /organization_following/u);
assert.match(feeds, /campus_organization/u);
assert.match(feeds, /Ver organización/u);

console.log('PASS Web Organizations authority/source contract');
