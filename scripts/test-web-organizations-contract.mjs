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
assert.match(service, /events:\s*\(\s*id:\s*string,\s*cursor\?/u);
assert.match(service, /from\?:\s*string/u);
assert.match(service, /if \(from && !cursor\) query\.set\("from", from\)/u);
assert.match(service, /archive:\s*\(/u);
assert.match(service, /\/organizations\/\$\{encodeURIComponent\(id\)\}\/archive/u);
assert.match(service, /expectedManagementRevision/u);
assert.match(service, /nextCursor:\s*string\s*\|\s*null/u);
assert.match(service, /institutionId\?:\s*string/u);
assert.match(service, /if \(input\.institutionId\) query\.set\("institutionId", input\.institutionId\)/u);

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
const mobileDirectory = await read(
  'apps/mobile/src/features/organizations/organizations-directory-screen.tsx',
);
const mobileDetail = await read(
  'apps/mobile/src/features/organizations/organization-detail-screen.tsx',
);
const mobileOrganizationApi = await read(
  'apps/mobile/src/features/organizations/organizations-api.ts',
);
const mobileOrganizationController = await read(
  'apps/mobile/src/features/organizations/organizations-controller.ts',
);
const mobileOrganizationShare = await read(
  'apps/mobile/src/features/organizations/organization-public-share.ts',
);
const organizationAvatar = await read(
  'apps/web/src/features/organizations/OrganizationAvatar.tsx',
);
assert.match(directory, /useAsyncAuthorityFence/u);
assert.equal((directory.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 5);
assert.match(directory, /user\?\.id/u);
assert.match(directory, /session\?\.id/u);
assert.match(directory, /directoryScopeKey/u);
assert.match(directory, /filterInstitutionSearchScopeKey/u);
assert.match(directory, /institutionId:\s*filterInstitution\?\.id/u);
assert.match(directory, /organizationsApi\.searchInstitutions\(\s*filterInstitutionQuery\.trim\(\),\s*ticket\.signal/u);
assert.match(directory, /id="organizations-filter-institution"/u);
assert.match(
  directory,
  /setFilterInstitutionSelection\(\{\s*authScopeKey,\s*institution: option/u,
);
assert.match(directory, /No encontramos instituciones con ese nombre\./u);
assert.match(directory, /institutionSearchScopeKey/u);
assert.match(directory, /ticket\.signal/u);
assert.match(directory, /await loadRef\.current\(\)/u);
assert.match(directory, /setInstitutionSelection\(\{\s*authScopeKey/u);
assert.match(directory, /<OrganizationAvatar/u);
assert.match(directory, /avatarUrl=\{item\.avatarUrl\}/u);
assert.match(directory, /OrganizationDirectoryFollowAction/u);
assert.match(directory, /organization-directory-follow:\$\{authScopeKey\}:\$\{organization\.id\}/u);
assert.match(directory, /organizationsApi\.follow\(organization\.id, ticket\.signal\)/u);
assert.match(directory, /organizationsApi\.unfollow\(organization\.id, ticket\.signal\)/u);
assert.match(directory, /organizationsApi\.get\(\s*organization\.id,\s*ticket\.signal/u);
assert.match(directory, /error\.status === 0 \|\| error\.status >= 500/u);
assert.match(directory, /confirmedFollowing === desiredFollowing/u);
assert.match(directory, /current\?\.scopeKey === directoryScopeKey/u);
assert.match(directory, /aria-label=\{`\$\{following \? "Dejar de seguir" : "Seguir"\}/u);
assert.match(directory, /role=\{feedback\.isError \? "alert" : "status"\}/u);
assert.match(directory, /className="organization-card-actions"/u);
assert.match(organizationAvatar, /PublicProfileAvatar/u);
assert.match(organizationAvatar, /size\?: "compact" \| "small" \| "profile"/u);
assert.match(mobileDirectory, /<PublicAvatar/u);
assert.match(mobileDirectory, /avatarUrl=\{organization\.avatarUrl\}/u);
assert.match(mobileDetail, /avatarUrl=\{current\.organization\.avatarUrl\}/u);
assert.match(mobileOrganizationApi, /from\?:\s*string/u);
assert.match(
  mobileOrganizationApi,
  /if \(from && !cursor\) query\.set\("from", from\)/u,
);
assert.match(mobileOrganizationApi, /institutionId\?:\s*string/u);
assert.match(
  mobileOrganizationApi,
  /if \(input\.institutionId\) query\.set\("institutionId", input\.institutionId\)/u,
);
assert.match(mobileDirectory, /filterInstitution\?\.id \?\? "all-institutions"/u);
assert.match(mobileDirectory, /institutionId: filterInstitution\.id/u);
assert.match(
  mobileDirectory,
  /mobileAcademicFollowsApi\s*\.search\(\s*"institution", request\.query/u,
);
assert.match(mobileDirectory, /request\.authorityKey !== authorityKey/u);
assert.match(mobileDirectory, /Buscar institución/u);
assert.match(mobileDirectory, /Quitar filtro de institución/u);
assert.match(mobileOrganizationController, /loadUpcomingEvents/u);
assert.match(mobileOrganizationController, /new Date\(\)\.toISOString\(\)/u);
assert.match(mobileOrganizationController, /upcomingEventsNextCursor/u);
assert.match(mobileOrganizationController, /async toggleFollow\(\s*authorityKey:\s*string,\s*organizationId:\s*string/u);
assert.match(mobileOrganizationController, /followAction: MobileOrganizationsDirectoryFollowAction \| null/u);
assert.match(mobileOrganizationController, /const confirmedFollowing = refreshed\.organization\.viewer\?\.following/u);
assert.match(mobileDirectory, /followAction=\{current\.followAction\}/u);
assert.match(mobileDirectory, /controller\.toggleFollow\(\s*current\.authorityKey,\s*organization\.id/u);
assert.match(mobileDirectory, /followActionBusy=\{directoryActionBusy\}/u);
assert.match(mobileDirectory, /accessibilityState=\{\{ busy, disabled: followActionBusy \}\}/u);
assert.match(mobileDirectory, /accessibilityRole=\{action\.status === "failure" \? "alert" : "text"\}/u);
assert.match(mobileDetail, /controller\.loadUpcomingEvents/u);
assert.match(mobileDetail, /controller\.showAllEvents/u);
assert.match(mobileDetail, /No hay próximos eventos\./u);
assert.match(mobileDetail, /Share\.share/u);
assert.match(mobileDetail, /mobileOrganizationPublicLink\(current\.organization\.id\)/u);
assert.match(mobileOrganizationShare, /losapuntes:\/\/\/organizations\//u);
assert.match(mobileOrganizationShare, /ORGANIZATION_UUID_V4_PATTERN/u);

const publicPage = await read('apps/web/src/pages/Organization.tsx');
const publicPageStyles = await read('apps/web/src/pages/Organizations.scss');
assert.match(publicPageStyles, /\.organizations-institution-filter\s*\{/u);
assert.match(
  publicPageStyles,
  /\.organizations-institution-filter input,\s*\.organizations-form input/u,
);
assert.match(
  publicPageStyles,
  /\.organization-card-actions button\s*\{[^}]*min-height:\s*44px/su,
);
const eventCalendar = await read(
  'apps/web/src/features/organizations/organization-event-calendar.mjs',
);
const organizationShare = await read(
  'apps/web/src/features/organizations/organization-public-share.mjs',
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
assert.match(publicPage, /postsNextCursor/u);
assert.match(publicPage, /eventsNextCursor/u);
assert.match(publicPage, /new Date\(\)\.toISOString\(\)/u);
assert.match(publicPage, /aria-label="Filtrar eventos"/u);
assert.match(publicPage, /aria-pressed=\{eventFilter === "upcoming"\}/u);
assert.match(publicPage, /aria-pressed=\{eventFilter === "all"\}/u);
assert.match(publicPage, /No hay próximos eventos\./u);
assert.match(publicPage, /loadUpcomingEvents/u);
assert.match(publicPage, /visibleEventsNextCursor/u);
assert.match(publicPage, /organizationPublicPath\(organization\.id\)/u);
assert.match(publicPage, /navigator\.share/u);
assert.match(publicPage, /navigator\.clipboard\.writeText/u);
assert.match(publicPage, /new URL\(path, window\.location\.origin\)/u);
assert.match(publicPage, /Enlace público de la organización/u);
assert.match(organizationShare, /UUID_V4_PATTERN/u);
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

console.log('PASS Web Organizations authority/source contract');
