import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  appendUniqueOrganizations,
  organizationDirectoryCursorRepeats,
} from '../apps/web/src/features/organizations/organization-directory-pagination.mjs';

const alreadyVisited = new Set(['cursor-1', 'cursor-2']);
assert.equal(organizationDirectoryCursorRepeats(alreadyVisited, 'cursor-3', 'cursor-3'), true);
assert.equal(organizationDirectoryCursorRepeats(alreadyVisited, 'cursor-3', 'cursor-1'), true);
assert.equal(organizationDirectoryCursorRepeats(alreadyVisited, 'cursor-3', 'cursor-2'), true);
assert.equal(organizationDirectoryCursorRepeats(alreadyVisited, 'cursor-3', 'cursor-4'), false);
assert.equal(organizationDirectoryCursorRepeats(alreadyVisited, 'cursor-3', null), false);
assert.equal(alreadyVisited.size, 2, 'Pure helpers never mutate history');
const dedupedDirectory = appendUniqueOrganizations(
  [{ id: 'a', name: 'Old' }, { id: 'b', name: 'Kept' }],
  [{ id: 'a', name: 'Updated' }, { id: 'c', name: 'New' }, { id: 'c', name: 'New again' }],
);
assert.deepEqual(dedupedDirectory, [
  { id: 'a', name: 'Updated' },
  { id: 'b', name: 'Kept' },
  { id: 'c', name: 'New again' },
]);
assert.deepEqual(appendUniqueOrganizations([], []), []);

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
assert.equal((directory.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 4);
assert.match(directory, /user\?\.id/u);
assert.match(directory, /session\?\.id/u);
assert.match(directory, /directoryScopeKey/u);
assert.match(service, /institutionId\?:\s*string/u);
assert.match(service, /if \(input\.institutionId\) query\.set\("institutionId", input\.institutionId\)/u);
assert.match(directory, /filterInstitutionSearchScopeKey/u);
assert.match(directory, /filterInstitution\?\.id \?\? "all-institutions"/u);
assert.match(directory, /institutionId:\s*filterInstitution\?\.id/u);
assert.match(directory, /filterInstitution\?\.id,\s*listState/u);
assert.match(directory, /organizationsApi\.searchInstitutions\(\s*filterInstitutionQuery\.trim\(\),\s*ticket\.signal/u);
assert.match(directory, /id="organizations-filter-institution"/u);
assert.match(directory, /No encontramos instituciones con ese nombre\./u);
assert.match(directory, /setFilterInstitutionSelection\(\{\s*authScopeKey,\s*institution: option/u);
assert.match(directory, /Quitar filtro/u);
assert.match(service, /if \(input\.cursor\) query\.set\("cursor", input\.cursor\)/u);
assert.match(directory, /requestedCursorsRef\.current/u);
assert.match(directory, /paginationRequestRef\.current/u);
assert.match(directory, /organizationDirectoryCursorRepeats\(/u);
assert.match(directory, /appendUniqueOrganizations\(latest\.items, result\.items\)/u);
assert.match(directory, /nextCursor: repeatedCursor \? null : result\.nextCursor/u);
assert.match(directory, /scopeKey: directoryScopeKey,\s*cursors: new Set\(\)/u);
assert.match(directory, /className="organizations-load-more"/u);
assert.match(directory, /aria-busy=\{loadingMore\}/u);
assert.match(directory, /Cargar más organizaciones/u);
assert.match(directory, /Reintentar carga/u);
assert.match(directory, /institutionSearchScopeKey/u);
assert.match(directory, /ticket\.signal/u);
assert.match(directory, /await loadRef\.current\(\)/u);
assert.match(directory, /setInstitutionSelection\(\{\s*authScopeKey/u);

const publicPage = await read('apps/web/src/pages/Organization.tsx');
const contentPagination = await read(
  'apps/web/src/features/organizations/contentPagination.ts',
);
const publicPageStyles = await read('apps/web/src/pages/Organizations.scss');
assert.match(publicPageStyles, /\.organizations-load-more button\s*\{[^}]*min-height:\s*44px/su);
assert.match(publicPageStyles, /\.organizations-institution-filter\s*\{/u);
assert.match(publicPageStyles, /\.organizations-institution-filter button\s*\{[^}]*min-height:\s*44px/su);
const eventCalendar = await read(
  'apps/web/src/features/organizations/organization-event-calendar.mjs',
);
assert.match(publicPage, /organizationsApi\.get\(/u);
assert.match(publicPage, /useLocation\(\)/u);
assert.match(publicPage, /feedReturnHref\(location\.state\)/u);
assert.match(publicPage, /feedReturnRestoreState\(location\.state\)/u);
assert.match(publicPage, /to=\{feedReturnTo\}[\s\S]*replace/u);
assert.match(publicPage, /to="\/organizations">\s*Volver al directorio/u);
assert.match(publicPage, /className="organization-feed-return"/u);
assert.match(
  publicPage,
  /import \{ AuthorProfileLink \} from "\.\.\/features\/profile\/AuthorProfileLink"/u,
);
assert.match(
  publicPage,
  /<AuthorProfileLink\s+profileId=\{manager\.profile\.profileId\}\s+displayName=\{manager\.profile\.displayName\}\s*\/>/u,
);
assert.match(
  publicPageStyles,
  /\.organization-feed-return\s*\{[^}]*min-height:\s*44px/su,
);
assert.match(publicPageStyles, /\.organization-feed-return:focus-visible/u);
assert.match(
  publicPageStyles,
  /\.organization-compact-list \.author-profile-link\s*\{[^}]*min-height:\s*44px/su,
);
assert.match(publicPage, /useAsyncAuthorityFence/u);
assert.equal((publicPage.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 2);
assert.match(publicPage, /organizationScopeKey/u);
assert.match(publicPage, /user\?\.id/u);
assert.match(publicPage, /session\?\.id/u);
assert.match(publicPage, /ticket\.signal/u);
assert.match(publicPage, /verificationState/u);
assert.match(publicPage, /organizationsApi\.posts\(/u);
assert.match(publicPage, /organizationsApi\.events\(/u);
assert.equal(
  (publicPage.match(/organizationContentCursorRepeats\(/gu) ?? []).length,
  2,
);
assert.match(publicPage, /postsCursorIssue/u);
assert.match(publicPage, /eventsCursorIssue/u);
assert.match(publicPage, /Actualizar publicaciones/u);
assert.match(publicPage, /Actualizar eventos/u);
assert.match(publicPage, /postsNextCursor/u);
assert.match(publicPage, /eventsNextCursor/u);
assert.match(publicPage, /serializeOrganizationEventCalendar/u);
assert.match(publicPage, /downloadOrganizationEventCalendar\(event\)/u);
assert.match(publicPage, /event\.state === "cancelled"/u);
assert.match(publicPage, /Descargar \.ics/u);
assert.match(publicPage, /Evento cancelado/u);
assert.match(publicPage, /URL\.createObjectURL/u);
assert.match(publicPage, /URL\.revokeObjectURL/u);
assert.match(eventCalendar, /DTSTART:/u);
assert.match(eventCalendar, /DTEND:/u);
assert.match(eventCalendar, /encodeURIComponent\(event\.id\)/u);
assert.match(eventCalendar, /foldCalendarLine/u);
assert.match(eventCalendar, /event\.state === ['"]scheduled['"]/u);
assert.match(publicPage, /appendPosts/u);
assert.match(publicPage, /appendEvents/u);
assert.match(publicPage, /Cargar más publicaciones/u);
assert.match(publicPage, /Cargar más eventos/u);
assert.match(contentPagination, /nextCursor === requestedCursor/u);
assert.match(contentPagination, /loadedCursors\.has\(nextCursor\)/u);
assert.doesNotMatch(publicPage, /actorUserId|createdByUserId/u);

const manage = await read('apps/web/src/pages/OrganizationManage.tsx');
assert.match(
  manage,
  /import \{ AuthorProfileLink \} from "\.\.\/features\/profile\/AuthorProfileLink"/u,
);
assert.match(
  manage,
  /<AuthorProfileLink\s+profileId=\{manager\.profile\.profileId\}\s+displayName=\{manager\.profile\.displayName\}\s*\/>/u,
);
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

const feedPresentation = await read(
  'apps/web/src/features/feeds/feed-item-presentation.mjs',
);
const feedSourceAttribution = await read(
  'apps/web/src/features/feeds/components/FeedSourceAttribution.tsx',
);
assert.match(feedPresentation, /organization_following/u);
assert.match(feedPresentation, /campus_organization/u);
assert.match(feedPresentation, /Ver organización/u);
assert.match(
  feedSourceAttribution,
  /item\.source\.kind === "campus_organization"/u,
);
assert.match(
  feedSourceAttribution,
  /to=\{`\/organizations\/\$\{encodeURIComponent\(item\.source\.organization\.id\)\}`\}/u,
);

const avatarRendererB282 = await read('apps/web/src/features/organizations/OrganizationAvatar.tsx');
const avatarDirectoryB282 = await read('apps/web/src/pages/Organizations.tsx');
const avatarDetailB282 = await read('apps/web/src/pages/Organization.tsx');
const avatarStylesB282 = await read('apps/web/src/pages/Organizations.scss');
assert.match(avatarRendererB282, /PublicProfileAvatar/u);
assert.match(avatarRendererB282, /avatarUrl=\{avatarUrl\}/u);
assert.match(avatarDirectoryB282, /<OrganizationAvatar/u);
assert.match(avatarDirectoryB282, /avatarUrl=\{item\.avatarUrl\}/u);
assert.match(avatarDirectoryB282, /institutionId:\s*filterInstitution\?\.id/u);
assert.match(avatarDetailB282, /<OrganizationAvatar/u);
assert.match(avatarDetailB282, /avatarUrl=\{organization\.avatarUrl\}/u);
assert.match(avatarDetailB282, /<OrganizationPublicShareAction/u);
assert.match(avatarStylesB282, /\.organization-public-identity/u);
assert.match(avatarStylesB282, /\.organization-card-main/u);

const directoryFollowB283 = await read('apps/web/src/features/organizations/OrganizationDirectoryFollowAction.tsx');
const followPageB283 = await read('apps/web/src/pages/Organizations.tsx');
const followStylesB283 = await read('apps/web/src/pages/Organizations.scss');
assert.match(directoryFollowB283, /organization-directory-follow:\$\{authScopeKey\}:\$\{organization\.id\}/u);
assert.match(directoryFollowB283, /organizationsApi\.follow\(organization\.id, ticket\.signal\)/u);
assert.match(directoryFollowB283, /organizationsApi\.unfollow\(organization\.id, ticket\.signal\)/u);
assert.match(directoryFollowB283, /organizationsApi\.get\(\s*organization\.id,\s*ticket\.signal/u);
assert.match(directoryFollowB283, /error\.status === 0 \|\| error\.status >= 500/u);
assert.match(directoryFollowB283, /confirmedFollowing === desiredFollowing/u);
assert.match(directoryFollowB283, /role=\{feedback\.isError \? "alert" : "status"\}/u);
assert.match(followPageB283, /<OrganizationDirectoryFollowAction/u);
assert.match(followPageB283, /authenticated && \(/u);
assert.match(followPageB283, /current\?\.scopeKey === directoryScopeKey/u);
assert.match(followPageB283, /institutionId:\s*filterInstitution\?\.id/u);
assert.match(followStylesB283, /\.organization-card-actions button\s*\{[^}]*min-height:\s*44px/su);

const mobileInstitutionApiB284 = await read('apps/mobile/src/features/organizations/organizations-api.ts');
const mobileInstitutionCtrlB284 = await read('apps/mobile/src/features/organizations/organizations-controller.ts');
const mobileInstitutionDirectoryB284 = await read('apps/mobile/src/features/organizations/organizations-directory-screen.tsx');
assert.match(mobileInstitutionApiB284, /institutionId\?:\s*string/u);
assert.match(mobileInstitutionApiB284, /if \(input\.institutionId\) query\.set\("institutionId", input\.institutionId\)/u);
assert.match(mobileInstitutionCtrlB284, /\.\.\.\(input\.institutionId \? \{ institutionId: input\.institutionId \} : \{\}\)/u);
assert.match(mobileInstitutionDirectoryB284, /filterInstitution\?\.id \?\? "all-institutions"/u);
assert.match(mobileInstitutionDirectoryB284, /institutionId: filterInstitution\.id/u);
assert.match(mobileInstitutionDirectoryB284, /mobileAcademicFollowsApi\s*\.search\(\s*"institution", request\.query/u);
assert.match(mobileInstitutionDirectoryB284, /request\.authorityKey !== authorityKey/u);
assert.match(mobileInstitutionDirectoryB284, /Buscar institución/u);
assert.match(mobileInstitutionDirectoryB284, /Quitar filtro de institución/u);
assert.match(mobileInstitutionDirectoryB284, /<PublicAvatar/u);

console.log('PASS Web Organizations authority/source contract');
