import assert from "node:assert/strict";
import test from "node:test";

import {
  recordStudyCollectionPageCursor,
  StudyCollectionPageChain,
} from "../src/features/study-collections/study-collections-pagination";

test("study collection pages stop self-repeats and cycles", () => {
  const history = new Set<string>();

  assert.equal(
    recordStudyCollectionPageCursor(history, "cursor-a", "cursor-b"),
    false,
  );
  assert.equal(
    recordStudyCollectionPageCursor(history, "cursor-b", "cursor-c"),
    false,
  );
  assert.equal(
    recordStudyCollectionPageCursor(history, "cursor-c", "cursor-a"),
    true,
  );
  assert.equal(
    recordStudyCollectionPageCursor(new Set(), "same", "same"),
    true,
  );
});

test("study collection list and detail histories remain independent", () => {
  const collections = new Set<string>();
  const resources = new Set<string>();

  assert.equal(
    recordStudyCollectionPageCursor(
      collections,
      "collection-page-a",
      "collection-page-b",
    ),
    false,
  );
  assert.equal(
    recordStudyCollectionPageCursor(
      resources,
      "resource-page-a",
      "collection-page-a",
    ),
    false,
  );
});

test("late pages cannot consume cursors after collection, session, or refresh changes", async () => {
  for (const replacement of [
    "other-collection",
    "other-session",
    "refresh-2",
  ]) {
    const chain = new StudyCollectionPageChain();
    chain.setScope("session:collection:refresh-1");
    const oldTicket = chain.begin("session:collection:refresh-1", "cursor-a");
    assert.ok(oldTicket);
    let resolve!: (cursor: string) => void;
    const response = new Promise<string>((done) => {
      resolve = done;
    });
    const latePage = response.then((cursor) => chain.record(oldTicket, cursor));

    chain.setScope(replacement);
    const newTicket = chain.begin(replacement, "cursor-b");
    assert.ok(newTicket);
    resolve("cursor-b");
    assert.equal(await latePage, null);
    chain.finish(oldTicket);
    assert.equal(chain.isCurrent(newTicket), true);
    assert.equal(chain.record(newTicket, "cursor-a"), false);
  }
});

test("rapid repeated pagination starts only one request and failed reads remain retryable", () => {
  const chain = new StudyCollectionPageChain();
  chain.setScope("scope");
  const first = chain.begin("scope", "cursor-a");
  assert.ok(first);
  assert.equal(chain.begin("scope", "cursor-a"), null);
  chain.finish(first);
  const retry = chain.begin("scope", "cursor-a");
  assert.ok(retry);
  assert.equal(chain.record(retry, "cursor-b"), false);
  chain.finish(retry);
  const next = chain.begin("scope", "cursor-b");
  assert.ok(next);
  assert.equal(chain.record(next, "cursor-a"), true);
});

test("refreshing a source resets its history without disturbing the other source", () => {
  const list = new StudyCollectionPageChain();
  const detail = new StudyCollectionPageChain();
  list.setScope("list:1");
  detail.setScope("detail:1");
  const listPage = list.begin("list:1", "cursor-a");
  const detailPage = detail.begin("detail:1", "cursor-b");
  assert.ok(listPage);
  assert.ok(detailPage);
  assert.equal(list.record(listPage, "cursor-a"), true);
  list.finish(listPage);
  list.setScope("list:2");
  const refreshed = list.begin("list:2", "cursor-c");
  assert.ok(refreshed);
  assert.equal(list.record(refreshed, "cursor-a"), false);
  assert.equal(detail.isCurrent(detailPage), true);
  assert.equal(detail.record(detailPage, null), false);
});
