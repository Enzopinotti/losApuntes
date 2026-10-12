import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  appendUniqueFeedItems,
  canAutomaticallyLoadWebFeed,
  didFeedCursorAdvance,
  requiresNewWebFeedSession,
} from "../apps/web/src/features/feeds/feed-pagination.mjs";
import { presentFeedItem } from "../apps/web/src/features/feeds/feed-item-presentation.mjs";
import {
  feedSelectionFromSearchParams,
  homeFeedHref,
} from "../apps/web/src/features/feeds/feed-navigation.mjs";

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
const homePage = await read("apps/web/src/pages/Home.tsx");
const itemContext = await read(
  "apps/web/src/features/feeds/components/FeedItemContext.tsx",
);
const itemPresentation = await read(
  "apps/web/src/features/feeds/feed-item-presentation.mjs",
);
const sourceAttribution = await read(
  "apps/web/src/features/feeds/components/FeedSourceAttribution.tsx",
);
assert.match(page, /feedsApi\.academic/u);
assert.match(page, /feedsApi\.forYou/u);
assert.match(page, /useSearchParams/u);
assert.match(page, /feedSelectionFromSearchParams\(searchParams\)/u);
assert.match(page, /aria-pressed=\{view === "academic"\}/u);
assert.match(page, /aria-pressed=\{view === "for-you"\}/u);
assert.match(page, /feedsApi\.updatePreferences/u);
assert.match(page, /feedsApi\.setFeedback/u);
assert.match(page, /useAsyncAuthorityFence/u);
assert.match(page, /beginFeedRequest/u);
assert.match(page, /isFeedRequestCurrent/u);
assert.match(page, /finishFeedRequest/u);
assert.match(page, /beginActionRequest/u);
assert.match(page, /isActionRequestCurrent/u);
assert.match(page, /finishActionRequest/u);
assert.match(page, /ticket\.signal/u);
assert.match(page, /stopReason\s*===\s*"natural_break"/u);
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
assert.match(page, /FeedItemContext item=\{item\}/u);
assert.match(page, /FeedItemOpenLink item=\{item\}/u);
assert.match(homePage, /FeedItemContext item=\{item\} reasonLimit=\{2\}/u);
assert.match(homePage, /FeedItemOpenLink item=\{item\}/u);
assert.match(homePage, /item\.summary/u);
assert.match(itemContext, /FeedSourceAttribution item=\{item\}/u);
assert.match(itemContext, /presentFeedItem\(item, reasonLimit\)/u);
assert.match(itemPresentation, /verificationState\s*===\s*"verified"/u);
assert.match(sourceAttribution, /item\.source\.organization\.name/u);
assert.match(
  sourceAttribution,
  /to=\{`\/organizations\/\$\{encodeURIComponent\(item\.source\.organization\.id\)\}`\}/u,
);
assert.match(
  sourceAttribution,
  /to=\{`\/p\/\$\{encodeURIComponent\(item\.author\.profileId\)\}`\}/u,
);
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
assert.equal(homeFeedHref("contextual", "subjects"), "/feeds?view=academic");
assert.equal(
  homeFeedHref("contextual", "community"),
  "/feeds?view=for-you&mode=community&order=ranked",
);
assert.equal(
  homeFeedHref("for-you", "subjects"),
  "/feeds?view=for-you&mode=balanced&order=ranked",
);
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
  id: "resource-1",
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
assert.equal(
  resourcePresentation.href,
  "/resources?q=Resumen%20%2F%20unidad%202&subjectId=subject%20%2F%202",
);
assert.equal(resourcePresentation.actionLabel, "Buscar apunte");

const routes = await read("apps/web/src/app/routes.tsx");
assert.match(
  routes,
  /path:\s*"feeds"[\s\S]*?<PrivateRoute>[\s\S]*?<Feeds\s*\/>[\s\S]*?<\/PrivateRoute>/u,
);

console.log(
  "PASS Web Feeds bounded automatic pagination and transport contract",
);
