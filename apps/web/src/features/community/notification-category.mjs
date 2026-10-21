/**
 * Pure view-only filters over the bounded notification pages already fetched.
 * An unknown event is visible in "all", but never falsely categorized as social.
 */
export const NOTIFICATION_CATEGORIES = Object.freeze([
  "all",
  "study",
  "network",
]);

export function notificationCategoryForType(type) {
  if (type === "qa.question_answered" || type === "qa.answer_accepted") {
    return "study";
  }
  if (
    type === "social.followed" ||
    type === "social.connection_requested" ||
    type === "social.connection_accepted"
  ) {
    return "network";
  }
  return null;
}

export function selectNotificationCategory(items, category) {
  if (!Array.isArray(items) || !NOTIFICATION_CATEGORIES.includes(category)) {
    return [];
  }
  if (category === "all") return items;
  return items.filter(
    (item) => notificationCategoryForType(item?.type) === category,
  );
}

export function notificationCategoryCounts(items) {
  const safe = Array.isArray(items) ? items : [];
  return {
    all: safe.length,
    study: selectNotificationCategory(safe, "study").length,
    network: selectNotificationCategory(safe, "network").length,
  };
}
