import type { NotificationView } from "./interfaces";

export function repeatsNotificationCursor(
  requestedCursors: ReadonlySet<string>,
  cursor: string,
  nextCursor: string | null,
): boolean;

export function appendUniqueNotifications(
  current: NotificationView[],
  next: NotificationView[],
): NotificationView[];
