import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import type { MobileNotificationView } from "../src/features/community/community-api";
import { mobileNotificationDestination } from "../src/features/notifications/notification-routing";

const notification = (
  target: MobileNotificationView["target"],
): MobileNotificationView => ({
  id: "notification-a",
  type:
    target.type === "connection"
      ? "social.connection_requested"
      : "qa.answer_accepted",
  actor: null,
  target,
  readAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
});

test("connection notifications carry their server relation id to the native inbox", () => {
  assert.deepEqual(
    mobileNotificationDestination(
      notification({ type: "connection", id: "connection-a" }),
    ),
    { kind: "connection", connectionId: "connection-a" },
  );
});

test("other notification target routes keep their existing native destinations", () => {
  assert.deepEqual(
    mobileNotificationDestination(
      notification({ type: "profile", id: "profile-a" }),
    ),
    { kind: "profile", profileId: "profile-a" },
  );
  assert.deepEqual(
    mobileNotificationDestination(
      notification({ type: "question", id: "question-a" }),
    ),
    { kind: "question", questionId: "question-a" },
  );
  assert.deepEqual(
    mobileNotificationDestination(
      notification({ type: "answer", id: "answer-a" }),
    ),
    { kind: "network" },
  );
});

test("the Network exposes the inbox and connection notifications open its target", () => {
  const network = readFileSync(
    new URL("../src/features/community/community-screens.tsx", import.meta.url),
    "utf8",
  );
  const notifications = readFileSync(
    new URL(
      "../src/features/notifications/notifications-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    network,
    /label="Abrir mi red"[\s\S]*router\.push\("\/social-connections"\)/u,
  );
  assert.match(notifications, /pathname: "\/social-connections"/u);
  assert.match(notifications, /connectionId: destination\.connectionId/u);
});

test("unroutable notifications do not invent a native destination", () => {
  assert.equal(
    mobileNotificationDestination(notification({ type: "profile", id: "" })),
    null,
  );
  assert.equal(
    mobileNotificationDestination(
      notification({ type: "resource", id: "resource-a" } as never),
    ),
    null,
  );
});

test("the native inbox disables dead links and waits for read authority before routing", () => {
  const notifications = readFileSync(
    new URL(
      "../src/features/notifications/notifications-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    notifications,
    /mobileNotificationDestination\(notification\) \?/u,
  );
  assert.match(notifications, /Sin destino disponible/u);
  assert.match(notifications, /await controller\.openAndMarkRead\(/u);
  assert.match(notifications, /if \(!canOpen\) return/u);
});
