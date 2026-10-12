import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
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

const read = (relativePath) =>
  readFile(path.join(process.cwd(), relativePath), "utf8");
const [page, styles, root] = await Promise.all([
  read("apps/web/src/pages/Network.tsx"),
  read("apps/web/src/pages/Community.scss"),
  read("package.json"),
]);
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
assert.match(styles, /\.network-requests/u);
assert.match(styles, /\.network-request-count/u);
assert.match(root, /test:web-network-presentation/u);

console.log("PASS Web Network grouping, labels and presentation contract");
