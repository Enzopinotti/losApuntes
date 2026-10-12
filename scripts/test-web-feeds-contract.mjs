import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  appendUniqueFeedItems,
  canAutomaticallyLoadWebFeed,
  didFeedCursorAdvance,
  requiresNewWebFeedSession,
} from "../apps/web/src/features/feeds/feed-pagination.mjs";

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
const sourceAttribution = await read(
  "apps/web/src/features/feeds/components/FeedSourceAttribution.tsx",
);
assert.match(page, /feedsApi\.academic/u);
assert.match(page, /feedsApi\.forYou/u);
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
assert.match(page, /verificationState\s*===\s*"verified"/u);
assert.match(page, /FeedSourceAttribution item=\{item\}/u);
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

const routes = await read("apps/web/src/app/routes.tsx");
assert.match(
  routes,
  /path:\s*"feeds"[\s\S]*?<PrivateRoute>[\s\S]*?<Feeds\s*\/>[\s\S]*?<\/PrivateRoute>/u,
);

console.log(
  "PASS Web Feeds bounded automatic pagination and transport contract",
);
