import assert from "node:assert/strict";
import test from "node:test";

import type {
  MobileNotificationType,
  MobileNotificationView,
} from "../src/features/community/community-api";
import {
  mobileNotificationActionLabel,
  mobileNotificationMessage,
} from "../src/features/notifications/notification-presenter";

const notification = (
  type: MobileNotificationType,
  displayName: string | null = "Ada",
): MobileNotificationView => ({
  id: `notification-${type}`,
  type,
  actor: displayName
    ? { profileId: "profile-a", displayName, avatarUrl: null }
    : null,
  target: { type: "profile", id: "profile-a" },
  readAt: null,
  createdAt: "2026-10-01T12:00:00.000Z",
});

test("notification copy covers every supported type and missing actors", () => {
  const cases: Array<[MobileNotificationType, string]> = [
    ["social.followed", "Ada empezó a seguirte."],
    ["social.connection_requested", "Ada te envió una solicitud de conexión."],
    ["social.connection_accepted", "Ada aceptó tu solicitud de conexión."],
    ["qa.question_answered", "Ada respondió tu pregunta."],
    ["qa.answer_accepted", "Ada aceptó tu respuesta."],
  ];

  for (const [type, expected] of cases) {
    assert.equal(mobileNotificationMessage(notification(type)), expected);
  }
  assert.equal(
    mobileNotificationMessage(notification("social.followed", null)),
    "Una persona de la comunidad empezó a seguirte.",
  );
});

test("repeated row actions have distinct contextual accessibility names", () => {
  const followed = notification("social.followed", "Ada");
  const answered = notification("qa.question_answered", "Luz");

  assert.equal(
    mobileNotificationActionLabel("open", followed),
    "Abrir: Ada empezó a seguirte.",
  );
  assert.equal(
    mobileNotificationActionLabel("mark_read", followed),
    "Marcar como leída: Ada empezó a seguirte.",
  );
  assert.notEqual(
    mobileNotificationActionLabel("open", followed),
    mobileNotificationActionLabel("open", answered),
  );
});
