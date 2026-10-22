import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  HOME_DISMISS_LIMIT,
  homeFeedItemKey,
  projectHomeFeed,
  hideHomeFeedItem,
  undoHomeFeedHide,
} from "../apps/web/src/features/feeds/home-feed-momentary-hide.mjs";
const items = [
  {
    type: "question",
    id: "67fe8f36-2c8d-4c85-897d-46702ebf127a",
    title: "Pregunta A",
  },
  {
    type: "resource",
    id: "8e4a8f43-4e3c-4af3-88df-37e8a5ac7937",
    title: "Apunte B",
  },
  {
    type: "organization_post",
    id: "91e9c9f6-e2bb-45d4-9c5d-13669536c5be",
    title: "Publicación C",
  },
];
test("B183 preserves order and source data", () => {
  const original = structuredClone(items);
  const view = projectHomeFeed(items, [homeFeedItemKey(items[1])]);
  assert.deepEqual(view.visible, [items[0], items[2]]);
  assert.equal(view.hiddenCount, 1);
  assert.deepEqual(items, original);
});
test("B183 hides one preview item without deleting it", () => {
  const keys = hideHomeFeedItem(items, [], items[1]);
  assert.deepEqual(keys, [homeFeedItemKey(items[1])]);
  assert.equal(projectHomeFeed(items, keys).visible.length, 2);
  assert.equal(items.length, 3);
});
test("B183 duplicates are idempotent, undo restores selected item", () => {
  const once = hideHomeFeedItem(items, [], items[0]);
  assert.deepEqual(hideHomeFeedItem(items, once, items[0]), once);
  const two = hideHomeFeedItem(items, once, items[1]);
  assert.deepEqual(undoHomeFeedHide(two, homeFeedItemKey(items[1])), once);
});
test("B183 feed types with equal ids remain distinct", () => {
  const a = { ...items[0], id: items[1].id };
  const view = projectHomeFeed([a, items[1]], [homeFeedItemKey(a)]);
  assert.equal(view.hiddenCount, 1);
  assert.deepEqual(view.visible, [items[1]]);
});
test("B183 all-hidden is distinct from server-empty", () => {
  const hidden = items.reduce(
    (keys, item) => hideHomeFeedItem(items, keys, item),
    [],
  );
  assert.equal(projectHomeFeed(items, hidden).visible.length, 0);
  assert.equal(projectHomeFeed(items, hidden).hiddenCount, 3);
  assert.equal(projectHomeFeed([], []).hiddenCount, 0);
});
test("B183 stale hidden items are excluded from refreshed response counts", () => {
  const next = projectHomeFeed(items.slice(1), [homeFeedItemKey(items[0])]);
  assert.deepEqual(next.visible, items.slice(1));
  assert.equal(next.hiddenCount, 0);
});
test("B183 rejects an item outside this authorized preview", () => {
  assert.throws(() =>
    hideHomeFeedItem(items, [], {
      type: "question",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }),
  );
  assert.throws(() => homeFeedItemKey({ type: "private", id: items[0].id }));
  assert.throws(() =>
    homeFeedItemKey({ type: "question", id: "../../passwords" }),
  );
});
test("B183 enforces hard cap and rejects malformed lists", () => {
  assert.equal(HOME_DISMISS_LIMIT, 16);
  assert.throws(() =>
    projectHomeFeed(
      Array.from({ length: 17 }, (_, i) => ({
        type: "question",
        id: "item-" + i,
      })),
      [],
    ),
  );
  assert.throws(() => projectHomeFeed([], Array(17).fill("question:test")));
  assert.throws(() => projectHomeFeed(items, "question:x"));
  assert.throws(() => undoHomeFeedHide(null, "question:x"));
});
test("B183 UI isolates state by session and feed and never writes remote", async () => {
  const src = await readFile("apps/web/src/pages/Home.tsx", "utf8");
  assert.ok(
    src.includes("key={") &&
      src.includes("authScopeKey") &&
      src.includes("activeHomeFeed"),
  );
  assert.ok(src.includes("const [hiddenKeys, setHiddenKeys]"));
  for (const label of ["Apartar por ahora", "Deshacer último", "Mostrar todo"])
    assert.ok(src.includes(label));
  assert.doesNotMatch(
    src,
    /localStorage|sessionStorage|setFeedback\(|setPreferences\(|navigator\.sendBeacon/u,
  );
});
test("B183 user-facing copy distinguishes all-hidden from server empty", async () => {
  const src = await readFile("apps/web/src/pages/Home.tsx", "utf8");
  assert.ok(src.includes("items.length === 0 ?"));
  assert.ok(src.includes("projected.visible.length === 0 ?"));
  assert.ok(src.includes("Apartaste todos los elementos"));
  const css = await readFile("apps/web/src/pages/Pilot.scss", "utf8");
  assert.match(css, /min-height: 44px/u);
  assert.match(css, /pilot-feed-momentary-status/u);
});
