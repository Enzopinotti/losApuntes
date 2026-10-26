import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NetworkActionGate } from "../apps/web/src/features/community/network-action-gate.ts";
import {
  appendUniqueNetworkItems,
  repeatsNetworkCursor,
} from "../apps/web/src/features/community/network-pagination.mjs";
import {
  groupNetworkConnections,
  networkConnectionStatusLabel,
} from "../apps/web/src/features/community/network-presentation.ts";

const item = (id, status, incoming) => ({
  id,
  status,
  incoming,
  other: { profileId: `profile-${id}`, displayName: `Persona ${id}`, avatarUrl: null },
  requestedByMe: !incoming,
  createdAt: "",
  updatedAt: "",
  respondedAt: null,
});

const visitedCursors = new Set(["following-a"]);
assert.equal(
  repeatsNetworkCursor(visitedCursors, "following-a", "following-a"),
  true,
);
assert.equal(
  repeatsNetworkCursor(visitedCursors, "following-b", "following-a"),
  true,
);
assert.equal(
  repeatsNetworkCursor(visitedCursors, "following-b", "following-c"),
  false,
);
assert.equal(repeatsNetworkCursor(visitedCursors, "following-a", null), false);
assert.deepEqual(
  appendUniqueNetworkItems(
    [
      { id: "person-1", name: "Old name" },
      { id: "person-2", name: "Second person" },
    ],
    [
      { id: "person-1", name: "Updated name" },
      { id: "person-3", name: "Third person" },
    ],
    (candidate) => candidate.id,
  ),
  [
    { id: "person-1", name: "Updated name" },
    { id: "person-2", name: "Second person" },
    { id: "person-3", name: "Third person" },
  ],
);

const relationships = [
  item("accepted", "accepted", false),
  item("outgoing", "pending", false),
  item("incoming-1", "pending", true),
  item("declined", "declined", false),
  item("incoming-2", "pending", true),
  item("disconnected", "disconnected", false),
];

const groups = groupNetworkConnections(relationships);
assert.deepEqual(
  groups.incomingRequests.map((connection) => connection.id),
  ["incoming-1", "incoming-2"],
);
assert.deepEqual(
  groups.otherRelationships.map((connection) => connection.id),
  ["accepted", "outgoing", "declined", "disconnected"],
);
assert.deepEqual(
  [...groups.incomingRequests, ...groups.otherRelationships]
    .map((connection) => connection.id).sort(),
  relationships.map((connection) => connection.id).sort(),
  "All relations must be rendered exactly once",
);
assert.deepEqual(
  relationships.map((connection) => connection.id),
  ["accepted", "outgoing", "incoming-1", "declined", "incoming-2", "disconnected"],
  "Grouping must not mutate server order",
);
assert.deepEqual(groupNetworkConnections([]), {
  incomingRequests: [],
  otherRelationships: [],
});

const expected = [
  "Conexión aceptada",
  "Solicitud enviada",
  "Solicitud recibida",
  "Solicitud rechazada",
  "Solicitud recibida",
  "Conexión finalizada",
];
assert.deepEqual(
  relationships.map(networkConnectionStatusLabel),
  expected,
  "Labels must correspond to server states, not inferred relationship",
);


const actionGate = new NetworkActionGate();
assert.equal(actionGate.tryAcquire("", "accept:id"), null);
assert.equal(actionGate.tryAcquire("session-a", ""), null);

const firstLease = actionGate.tryAcquire("session-a", "accept:connection-1");
assert.ok(firstLease, "The first action should acquire synchronously");
assert.equal(
  actionGate.tryAcquire("session-a", "decline:connection-1"),
  null,
  "An opposing action in the same session must not run concurrently",
);
assert.equal(
  actionGate.tryAcquire("session-a", "following-more"),
  null,
  "Pagination must not race with a pending mutation",
);
assert.equal(
  actionGate.release({ ...firstLease }),
  false,
  "A forged or stale lease must not release an active action",
);
assert.equal(actionGate.tryAcquire("session-a", "accept:connection-1"), null);

const newSessionLease = actionGate.tryAcquire(
  "session-b",
  "connect:profile-2",
);
assert.ok(newSessionLease, "Session changes should not inherit an old lock");
assert.equal(
  actionGate.release(firstLease),
  false,
  "An old-session request must not release a newer session's lock",
);
assert.equal(actionGate.tryAcquire("session-b", "unfollow:profile-2"), null);
assert.equal(actionGate.release(newSessionLease), true);

const nextLease = actionGate.tryAcquire(
  "session-b",
  "following-more",
);
assert.ok(nextLease, "Finishing an action should allow the next one");
assert.ok(nextLease.sequence > newSessionLease.sequence);
assert.equal(actionGate.release(nextLease), true);
assert.equal(actionGate.release(nextLease), false);

const read = (relativePath) =>
  readFile(path.join(process.cwd(), relativePath), "utf8");
const [page, styles, root] = await Promise.all([
  read("apps/web/src/pages/Network.tsx"),
  read("apps/web/src/pages/Community.scss"),
  read("package.json"),
]);
assert.match(page, /actionGateRef\.current\.tryAcquire/u);
assert.equal(
  page.match(/actionGateRef\.current\.release\(lease\)/gu)?.length,
  6,
  "Every acquisition must release on early return and on completion",
);
assert.equal(
  page.match(/disabled=\{Boolean\(busy\)\}/gu)?.length >= 5,
  true,
  "Network mutation and pagination buttons must share the busy state",
);
assert.doesNotMatch(page, /disabled=\{busy === `follow:/u);
assert.match(page, /groupNetworkConnections\(connections\)/u);
assert.match(page, /connectionGroups\.incomingRequests\.map/u);
assert.match(page, /connectionGroups\.otherRelationships\.map/u);
assert.match(page, /networkConnectionStatusLabel\(connection\)/u);
assert.match(page, /communityApi\.respondConnection/u);
assert.match(page, /communityApi\.disconnect/u);
assert.match(page, /network-person-name/u);
assert.match(page, /encodeURIComponent\(connection\.other\.profileId\)/u);
assert.match(page, /No encontramos perfiles públicos/u);
assert.match(page, /people\.length === 0/u);
assert.match(page, /role="status"/u);
assert.match(page, /connectionsNextCursor/u);
assert.match(page, /loadMoreConnections/u);
assert.match(page, /cursorHistoryRef/u);
assert.match(page, /history\.following/u);
assert.match(page, /history\.connections/u);
assert.match(page, /repeatedCursorMessage/u);
assert.match(page, /appendUniqueNetworkItems/u);
assert.match(styles, /\.network-requests/u);
assert.match(styles, /\.network-request-count/u);
assert.match(root, /test:web-network-presentation/u);

console.log("PASS Web Network grouping, labels and presentation contract");
