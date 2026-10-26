import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  appendUniqueFeedItems,
  canAutomaticallyLoadWebFeed,
  didFeedCursorAdvance,
  feedPageLoadedAnnouncement,
  requiresNewWebFeedSession,
} from "../apps/web/src/features/feeds/feed-pagination.mjs";
import { presentFeedItem } from "../apps/web/src/features/feeds/feed-item-presentation.mjs";
import {
  feedReturnHref,
  feedReturnHomeIntent,
  feedReturnRestoreState,
  feedReturnScrollKey,
  feedRestoreHomeIntent,
  feedSelectionFromSearchParams,
  homeFeedHref,
} from "../apps/web/src/features/feeds/feed-navigation.mjs";
import {
  clearFeedScrollPositions,
  feedRestorePositionKey,
  feedScrollAuthorityScope,
  rememberFeedScrollPosition,
  takeFeedScrollPosition,
} from "../apps/web/src/features/feeds/feed-scroll-restoration.mjs";
import { homeFeedEmptyGuidance } from "../apps/web/src/features/feeds/home-feed-empty-guidance.mjs";
import { fullFeedEmptyGuidance } from "../apps/web/src/features/feeds/full-feed-empty-guidance.mjs";

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const service = await read(
  "apps/web/src/features/feeds/services/feedsService.ts",
);
assert.match(service, /credentials:\s*"include"/u);
assert.match(service, /cache:\s*"no-store"/u);
assert.match(service, /AbortSignal\.timeout\(15_000\)/u);
assert.match(service, /AbortSignal\.any/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /watchTime|watch_time|ctr|popularity/iu);

const page = await read("apps/web/src/pages/Feeds.tsx");
const pageStyles = await read("apps/web/src/pages/Feeds.scss");
const homePage = await read("apps/web/src/pages/Home.tsx");
const itemContext = await read(
  "apps/web/src/features/feeds/components/FeedItemContext.tsx",
);
const itemContextStyles = await read(
  "apps/web/src/features/feeds/components/FeedItemContext.scss",
);
const resourcesPage = await read("apps/web/src/pages/Resources.tsx");
const questionsPage = await read("apps/web/src/pages/Questions.tsx");
const itemPresentation = await read(
  "apps/web/src/features/feeds/feed-item-presentation.mjs",
);
const sourceAttribution = await read(
  "apps/web/src/features/feeds/components/FeedSourceAttribution.tsx",
);
assert.match(page, /feedsApi\.academic/u);
assert.match(page, /feedsApi\.forYou/u);
assert.match(page, /fullFeedEmptyGuidance\(view, mode\)/u);
assert.match(page, /emptyGuidance\.href/u);
assert.match(page, /useSearchParams/u);
assert.match(page, /feedSelectionFromSearchParams\(searchParams\)/u);
assert.match(page, /aria-pressed=\{view === "academic"\}/u);
assert.match(page, /aria-pressed=\{view === "for-you"\}/u);
assert.match(page, /feedsApi\.updatePreferences/u);
assert.match(page, /feedsApi\.setFeedback/u);
assert.match(page, /useAsyncAuthorityFence/u);
assert.match(page, /useLayoutEffect/u);
assert.match(page, /previousAuthorityScopeRef\.current === authorityScope/u);
assert.match(page, /dataScopeRef\.current = null;[\s\S]*setItems\(\[\]\)/u);
assert.match(
  page,
  /setPreferences\(null\);[\s\S]*setEffectiveSignals\(null\)/u,
);
assert.match(page, /window\.scrollTo\(0, 0\)/u);
assert.match(page, /beginFeedRequest/u);
assert.match(page, /isFeedRequestCurrent/u);
assert.match(page, /finishFeedRequest/u);
assert.match(page, /beginActionRequest/u);
assert.match(page, /isActionRequestCurrent/u);
assert.match(page, /finishActionRequest/u);
assert.match(page, /ticket\.signal/u);
assert.match(page, /stopReason\s*===\s*"natural_break"/u);
assert.match(
  page,
  /feedPageLoadedAnnouncement\(nextItems\.length - previousItems\.length\)/u,
);
assert.match(page, /itemsRef\.current = nextItems/u);
assert.match(
  page,
  /className="feeds-visually-hidden"\s+role="status"\s+aria-live="polite"\s+aria-atomic="true"/u,
);
assert.match(
  pageStyles,
  /\.feeds-visually-hidden\s*\{[\s\S]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/u,
);
assert.match(page, /new IntersectionObserver/u);
assert.match(page, /observer\.observe\(sentinel\)/u);
assert.match(page, /continuationRef/u);
assert.match(page, /FEED_PREFETCH_ROOT_MARGIN/u);
assert.match(page, /inFlightPageRef\.current\?\.key === pageKey/u);
assert.match(page, /inFlightPageRef\.current = null/u);
assert.match(page, /inFlightPageRef\.current === pageRequest/u);
assert.match(page, /rootRequestRef\.current === null/u);
assert.match(page, /rootRequestRef\.current = rootRequest/u);
assert.match(page, /latestCursorRef\.current = null/u);
assert.match(page, /dataScopeRef\.current = feedRequestScope/u);
assert.match(page, /dataScopeRef\.current !== feedRequestScope/u);
assert.match(page, /Reintentar esta página/u);
assert.match(page, /Empezar una nueva sesión/u);
assert.match(page, /pendingScrollRestoreRef/u);
assert.match(page, /feedRestorePositionKey\(\s*location\.state/u);
assert.match(page, /takeFeedScrollPosition\(/u);
assert.match(page, /clearFeedScrollPositions\(\)/u);
assert.match(page, /targetY <= maxScrollY/u);
assert.match(page, /void loadFeed\(nextCursor, true\)/u);
assert.match(page, /stopReason !== null/u);
assert.match(page, /FeedItemContext item=\{item\}/u);
assert.match(page, /FeedItemOpenLink item=\{item\}/u);
assert.match(
  homePage,
  /<FeedItemContext[\s\S]{0,120}item=\{item\}[\s\S]{0,80}reasonLimit=\{2\}/u,
);
assert.match(
  homePage,
  /FeedItemContext[\s\S]{0,100}homeIntent=\{homeIntent\}/u,
);
assert.match(homePage, /FeedItemOpenLink item=\{item\}/u);
assert.match(homePage, /item\.summary/u);
assert.match(homePage, /homeFeedEmptyGuidance\(/u);
assert.match(homePage, /emptyGuidance\.href/u);
assert.match(homePage, /emptyGuidance\.actionLabel/u);
assert.match(homePage, /previousAuthScopeKeyRef\.current === authScopeKey/u);
assert.match(homePage, /feedRestorePositionKey\(\s*location\.state/u);
assert.match(homePage, /feedRestoreHomeIntent\(\s*location\.state/u);
assert.match(homePage, /homeIntent=\{activeHomeFeed\}/u);
assert.match(
  homePage,
  /<FeedItemOpenLink item=\{item\} homeIntent=\{homeIntent\}/u,
);
assert.match(homePage, /takeFeedScrollPosition\(/u);
assert.match(homePage, /clearFeedScrollPositions\(\)/u);
assert.match(homePage, /setActiveHomeFeed\("contextual"\)/u);
assert.match(homePage, /setSnapshotState\(null\)/u);
assert.match(homePage, /window\.scrollTo\(0, 0\)/u);
assert.match(homePage, /to="\/questions">\s*Hacer una pregunta/u);
assert.match(homePage, /to="\/resources">\s*Subir un apunte/u);
const createEntryStart = homePage.indexOf("pilot-create-entry");
const homeFeedStart = homePage.indexOf("pilot-home-feed");
assert.ok(
  createEntryStart !== -1 &&
    homeFeedStart !== -1 &&
    createEntryStart < homeFeedStart,
  "Home puts real creation entry points before its feed",
);
const shortcutsStart = homePage.indexOf("pilot-shortcuts");
assert.notEqual(shortcutsStart, -1, "Home keeps exploration shortcuts");
assert.doesNotMatch(
  homePage.slice(shortcutsStart),
  /to="\/(?:questions|resources)"/u,
  "Home does not repeat create links in the exploration shortcuts",
);
assert.match(itemContext, /FeedSourceAttribution item=\{item\}/u);
assert.match(itemContext, /presentFeedItem\(item, reasonLimit\)/u);
assert.match(itemContext, /import \{ PublicProfileAvatar \}/u);
assert.match(itemContext, /avatarUrl=\{presentation\.avatarUrl\}/u);
assert.match(itemContext, /displayName=\{presentation\.displayName\}/u);
assert.match(itemContext, /size="feed"/u);
assert.doesNotMatch(itemContext, /<img/u);
assert.match(itemContext, /feedReturnTo:\s*returnTo/u);
assert.match(itemContext, /feedReturnKey:\s*returnKey/u);
assert.match(itemContext, /feedReturnHomeIntent:\s*homeIntent/u);
assert.match(itemContext, /rememberFeedScrollPosition\(/u);
assert.match(itemContext, /window\.scrollY/u);
assert.match(itemContext, /event\.metaKey[\s\S]*event\.ctrlKey/u);
assert.match(
  itemContext,
  /FeedSourceAttribution item=\{item\} homeIntent=\{homeIntent\}/u,
);
assert.match(sourceAttribution, /feedScrollAuthorityScope\(/u);
assert.match(sourceAttribution, /rememberFeedScrollPosition\(/u);
assert.match(sourceAttribution, /window\.scrollY/u);
assert.match(sourceAttribution, /feedReturnTo:\s*returnTo/u);
assert.match(sourceAttribution, /feedReturnKey:\s*returnKey/u);
assert.match(sourceAttribution, /feedReturnHomeIntent:\s*homeIntent/u);
assert.match(sourceAttribution, /state=\{feedReturnState\}/u);
assert.match(sourceAttribution, /onClick=\{rememberFeedPosition\}/u);
assert.match(sourceAttribution, /const feedReturnState = \{/u);
assert.match(
  sourceAttribution,
  /const rememberFeedPosition = \(event: MouseEvent<HTMLAnchorElement>\)/u,
);
assert.match(sourceAttribution, /event\.metaKey[\s\S]*event\.ctrlKey/u);
assert.match(
  itemContextStyles,
  /\.feed-item-byline \.feed-source-link:focus-visible/u,
);
assert.match(resourcesPage, /const resourceReturnState = searchReturnTo/u);
assert.match(resourcesPage, /: feedReturnRestoreState\(location\.state\)/u);
assert.match(resourcesPage, /state=\{resourceReturnState\}/u);
assert.match(
  questionsPage,
  /state=\{feedReturnRestoreState\(location\.state\)\}/u,
);
assert.match(itemPresentation, /verificationState\s*===\s*"verified"/u);
assert.match(sourceAttribution, /item\.source\.organization\.name/u);
assert.match(
  sourceAttribution,
  /to=\{`\/organizations\/\$\{encodeURIComponent\(item\.source\.organization\.id\)\}`\}/u,
);
const organizationAttributionStart = sourceAttribution.indexOf(
  'if (item.source.kind === "campus_organization")',
);
const profileAttributionStart = sourceAttribution.indexOf(
  "const profileId = item.author.profileId",
);
assert.ok(
  organizationAttributionStart !== -1 &&
    profileAttributionStart > organizationAttributionStart,
  "organization attribution has a dedicated source-link branch",
);
const organizationAttribution = sourceAttribution.slice(
  organizationAttributionStart,
  profileAttributionStart,
);
assert.match(organizationAttribution, /state=\{feedReturnState\}/u);
assert.match(organizationAttribution, /onClick=\{rememberFeedPosition\}/u);
assert.match(
  sourceAttribution,
  /to=\{`\/p\/\$\{encodeURIComponent\(profileId\)\}`\}/u,
);
assert.match(sourceAttribution, /profileId\.trim\(\) === profileId/u);
assert.match(sourceAttribution, /item\.author\.displayName/u);
assert.doesNotMatch(page, /const reasonLabels/u);
assert.doesNotMatch(page, /Ver otra tanda/u);
assert.doesNotMatch(page, /localStorage|sessionStorage/u);
assert.doesNotMatch(page, /setInterval|setTimeout/u);

const continuationState = {
  nextCursor: "opaque-cursor-2",
  stopReason: null,
  loading: false,
  busy: null,
  hasError: false,
};
assert.deepEqual(
  feedSelectionFromSearchParams(
    new URLSearchParams("view=for-you&mode=community&order=chronological"),
  ),
  { view: "for-you", mode: "community", order: "chronological" },
);
assert.deepEqual(
  feedSelectionFromSearchParams(
    new URLSearchParams("view=unknown&mode=unknown&order=unknown"),
  ),
  { view: "academic", mode: "balanced", order: "ranked" },
);
assert.equal(feedReturnHref({ feedReturnTo: "/" }), "/");
assert.equal(feedReturnHref({ feedReturnTo: "/feeds" }), "/feeds");
assert.equal(feedReturnScrollKey({ feedReturnKey: "route-key" }), "route-key");
assert.deepEqual(
  feedReturnRestoreState({ feedReturnTo: "/", feedReturnKey: "route-key" }),
  { feedRestoreTo: "/", feedRestoreKey: "route-key" },
);
assert.equal(
  feedReturnHomeIntent({ feedReturnHomeIntent: "for-you" }),
  "for-you",
);
assert.equal(feedReturnHomeIntent({ feedReturnHomeIntent: "community" }), null);
assert.deepEqual(
  feedReturnRestoreState({
    feedReturnTo: "/",
    feedReturnKey: "route-key",
    feedReturnHomeIntent: "for-you",
  }),
  {
    feedRestoreTo: "/",
    feedRestoreKey: "route-key",
    feedRestoreHomeIntent: "for-you",
  },
);
assert.equal(
  feedReturnRestoreState({
    feedReturnTo: "/feeds?view=academic",
    feedReturnKey: "route-key",
    feedReturnHomeIntent: "for-you",
  })?.feedRestoreHomeIntent,
  undefined,
);
assert.equal(
  feedRestoreHomeIntent(
    {
      feedRestoreTo: "/",
      feedRestoreKey: "route-key",
      feedRestoreHomeIntent: "for-you",
    },
    "/",
  ),
  "for-you",
);
assert.equal(
  feedRestoreHomeIntent(
    {
      feedRestoreTo: "/feeds?view=academic",
      feedRestoreKey: "route-key",
      feedRestoreHomeIntent: "for-you",
    },
    "/",
  ),
  null,
);
assert.equal(
  feedRestoreHomeIntent(
    {
      feedRestoreTo: "/",
      feedRestoreKey: "route-key",
      feedRestoreHomeIntent: "discover",
    },
    "/",
  ),
  null,
);
assert.equal(
  feedRestoreHomeIntent(
    {
      feedRestoreTo: "/",
      feedRestoreKey: "bad\nkey",
      feedRestoreHomeIntent: "for-you",
    },
    "/",
  ),
  null,
);
assert.equal(
  feedReturnRestoreState({
    feedReturnTo: "/resources",
    feedReturnKey: "route-key",
  }),
  null,
);
assert.equal(
  feedReturnRestoreState({ feedReturnTo: "/", feedReturnKey: "bad\nkey" }),
  null,
);
assert.equal(
  feedReturnHref({
    feedReturnTo: "/feeds?view=for-you&mode=community&order=ranked",
  }),
  "/feeds?view=for-you&mode=community&order=ranked",
);
for (const locationState of [
  null,
  undefined,
  "feed state",
  {},
  { feedReturnTo: "https://example.test/" },
  { feedReturnTo: "//example.test/" },
  { feedReturnTo: "/resources" },
  { feedReturnTo: "/feeds/other" },
  { feedReturnTo: "/feeds#fragment" },
  { feedReturnTo: "/feeds?view=academic\\\\@example.test" },
]) {
  assert.equal(feedReturnHref(locationState), null);
}
assert.equal(
  feedRestorePositionKey(
    { feedRestoreTo: "/feeds?view=academic", feedRestoreKey: "route-key" },
    "/feeds?view=academic",
  ),
  "route-key",
);
assert.equal(
  feedRestorePositionKey(
    { feedRestoreTo: "/feeds?view=academic", feedRestoreKey: "route-key" },
    "/feeds?view=for-you",
  ),
  null,
);
assert.equal(
  feedRestorePositionKey(
    { feedRestoreTo: "/resources", feedRestoreKey: "route-key" },
    "/resources",
  ),
  null,
);
const scrollAuthority = feedScrollAuthorityScope(
  "authenticated",
  "user-a",
  "session-a",
);
assert.notEqual(
  scrollAuthority,
  feedScrollAuthorityScope("authenticated", "user-a", "session-b"),
);
clearFeedScrollPositions();
assert.equal(
  rememberFeedScrollPosition("route-key", scrollAuthority, 640),
  true,
);
assert.equal(takeFeedScrollPosition("route-key", scrollAuthority), 640);
assert.equal(takeFeedScrollPosition("route-key", scrollAuthority), null);
assert.equal(
  rememberFeedScrollPosition("route-key", scrollAuthority, 12),
  true,
);
assert.equal(
  takeFeedScrollPosition(
    "route-key",
    feedScrollAuthorityScope("authenticated", "user-a", "session-b"),
  ),
  null,
);
assert.equal(rememberFeedScrollPosition("bad\nkey", scrollAuthority, 1), false);
assert.equal(
  rememberFeedScrollPosition("route-key", scrollAuthority, -1),
  false,
);
for (let index = 0; index < 33; index += 1) {
  rememberFeedScrollPosition(`bounded-${index}`, scrollAuthority, index);
}
assert.equal(takeFeedScrollPosition("bounded-0", scrollAuthority), null);
assert.equal(takeFeedScrollPosition("bounded-32", scrollAuthority), 32);
clearFeedScrollPositions();
assert.equal(homeFeedHref("contextual", "subjects"), "/feeds?view=academic");
assert.equal(
  homeFeedHref("contextual", "community"),
  "/feeds?view=for-you&mode=community&order=ranked",
);
assert.equal(
  homeFeedHref("for-you", "subjects"),
  "/feeds?view=for-you&mode=balanced&order=ranked",
);
assert.deepEqual(homeFeedEmptyGuidance("contextual", "community"), {
  message: "Todavía no hay publicaciones de tu comunidad en esta vista.",
  href: "/network",
  actionLabel: "Explorar mi red",
});
assert.deepEqual(homeFeedEmptyGuidance("contextual", "subjects"), {
  message: "Todavía no hay publicaciones para esta vista por ahora.",
  href: "/search",
  actionLabel: "Buscar contenido",
});
assert.equal(
  homeFeedEmptyGuidance("for-you", "community").href,
  "/search",
  "The community destination applies only to the contextual community feed",
);
assert.deepEqual(fullFeedEmptyGuidance("academic", "balanced"), {
  message: "Podés buscar apuntes, preguntas y materias en Los Apuntes.",
  href: "/search",
  actionLabel: "Buscar contenido",
});
assert.deepEqual(fullFeedEmptyGuidance("for-you", "community"), {
  message: "Podés explorar las personas y relaciones de tu red.",
  href: "/network",
  actionLabel: "Explorar mi red",
});
assert.equal(fullFeedEmptyGuidance("for-you", "study").href, "/search");
assert.equal(canAutomaticallyLoadWebFeed(continuationState), true);
assert.equal(
  canAutomaticallyLoadWebFeed({ ...continuationState, nextCursor: null }),
  false,
);
assert.equal(
  canAutomaticallyLoadWebFeed({
    ...continuationState,
    stopReason: "natural_break",
  }),
  false,
);
assert.equal(
  canAutomaticallyLoadWebFeed({ ...continuationState, loading: true }),
  false,
);
assert.equal(
  canAutomaticallyLoadWebFeed({ ...continuationState, busy: "more" }),
  false,
);
assert.equal(
  canAutomaticallyLoadWebFeed({ ...continuationState, hasError: true }),
  false,
);
assert.equal(didFeedCursorAdvance("opaque-cursor-2", "opaque-cursor-3"), true);
assert.equal(didFeedCursorAdvance("opaque-cursor-2", "opaque-cursor-2"), false);
assert.equal(
  didFeedCursorAdvance(
    "opaque-cursor-3",
    "opaque-cursor-2",
    new Set(["opaque-cursor-2"]),
  ),
  false,
  "Cursor cycles must stop the automatic observer",
);
for (const code of [
  "FEED_CURSOR_INVALID",
  "FEED_CURSOR_STALE",
  "FEED_CURSOR_CONTEXT_MISMATCH",
  "FEED_PREFERENCES_REVISION_CONFLICT",
]) {
  assert.equal(requiresNewWebFeedSession(code), true);
}
assert.equal(requiresNewWebFeedSession("NETWORK_UNAVAILABLE"), false);
assert.equal(
  feedPageLoadedAnnouncement(0),
  "La siguiente página no agregó publicaciones nuevas.",
);
assert.equal(feedPageLoadedAnnouncement(1), "Se agregó 1 publicación nueva.");
assert.equal(
  feedPageLoadedAnnouncement(6),
  "Se agregaron 6 publicaciones nuevas.",
);
assert.equal(feedPageLoadedAnnouncement(-1), "");

const duplicateItem = { type: "resource", id: "shared" };
const pageOnlyItem = { type: "question", id: "shared" };
assert.deepEqual(
  appendUniqueFeedItems([duplicateItem], [duplicateItem, pageOnlyItem]),
  [duplicateItem, pageOnlyItem],
  "Feed pages deduplicate by type and stable id",
);

const questionItem = {
  type: "question",
  id: "question / 1",
  title: "Cómo resolver este ejercicio",
  summary: "Una consulta de la materia.",
  author: {
    profileId: "profile-1",
    displayName: "Ana Pérez",
    avatarUrl: null,
  },
  source: { kind: "personal_user" },
  academic: { subject: { id: "subject-1", name: "Anatomía" } },
  why: ["unanswered_question", "current_subject"],
  createdAt: "2026-10-12T12:00:00.000Z",
};
const questionPresentation = presentFeedItem(questionItem);
assert.equal(questionPresentation.kindLabel, "Pregunta");
assert.equal(questionPresentation.displayName, "Ana Pérez");
assert.equal(questionPresentation.avatarUrl, null);
assert.equal(questionPresentation.subjectName, "Anatomía");
assert.deepEqual(questionPresentation.reasonLabels, [
  "Pregunta sin responder",
  "De tu materia actual",
]);
assert.equal(questionPresentation.href, "/questions?id=question%20%2F%201");
assert.equal(questionPresentation.actionLabel, "Abrir pregunta");
assert.equal(questionPresentation.verifiedOrganization, false);
assert.ok(questionPresentation.createdAtLabel);
assert.deepEqual(
  presentFeedItem(
    {
      ...questionItem,
      why: ["fresh", "exploration"],
      createdAt: "invalid-date",
    },
    1,
  ).reasonLabels,
  ["Publicado recientemente"],
  "Home previews cap reason badges to the first server-provided reasons",
);
assert.equal(
  presentFeedItem({ ...questionItem, createdAt: "invalid-date" })
    .createdAtLabel,
  null,
  "Malformed timestamps do not render a broken date label",
);

const organizationPresentation = presentFeedItem({
  type: "organization_post",
  id: "post-1",
  title: "Jornada universitaria",
  summary: "",
  author: {
    profileId: null,
    displayName: "Autor interno",
    avatarUrl: "https://example.test/person.png",
  },
  source: {
    kind: "campus_organization",
    organization: {
      id: "org / 1",
      name: "Centro de Estudiantes",
      avatarUrl: null,
      verificationState: "verified",
    },
  },
  academic: { subject: null },
  why: ["organization_following"],
  createdAt: "2026-10-12T12:00:00.000Z",
});
assert.equal(organizationPresentation.displayName, "Centro de Estudiantes");
assert.equal(organizationPresentation.avatarUrl, null);
assert.equal(organizationPresentation.verifiedOrganization, true);
assert.equal(organizationPresentation.href, "/organizations/org%20%2F%201");
assert.equal(organizationPresentation.actionLabel, "Ver organización");

const resourcePresentation = presentFeedItem({
  type: "resource",
  id: "resource / 1",
  title: "Resumen / unidad 2",
  summary: "",
  author: {
    profileId: null,
    displayName: "Autor",
    avatarUrl: "https://example.test/avatar.png",
  },
  source: { kind: "personal_user" },
  academic: { subject: { id: "subject / 2", name: "Fisiología" } },
  why: ["current_subject"],
  createdAt: "2026-10-12T12:00:00.000Z",
});
assert.equal(resourcePresentation.kindLabel, "Apunte");
assert.equal(resourcePresentation.avatarUrl, "https://example.test/avatar.png");
assert.equal(resourcePresentation.href, "/resources/resource%20%2F%201");
assert.equal(resourcePresentation.actionLabel, "Abrir apunte");

const routes = await read("apps/web/src/app/routes.tsx");
assert.match(
  routes,
  /path:\s*"feeds"[\s\S]*?<PrivateRoute>[\s\S]*?<Feeds\s*\/>[\s\S]*?<\/PrivateRoute>/u,
);

console.log(
  "PASS Web Feeds bounded automatic pagination and transport contract",
);
