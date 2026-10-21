import type { NotificationView } from "./interfaces";

export type NotificationCategory = "all" | "study" | "network";

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[];

export function notificationCategoryForType(
  type: unknown,
): Exclude<NotificationCategory, "all"> | null;

export function selectNotificationCategory(
  items: NotificationView[],
  category: NotificationCategory,
): NotificationView[];

export function notificationCategoryCounts(
  items: NotificationView[],
): Record<NotificationCategory, number>;
