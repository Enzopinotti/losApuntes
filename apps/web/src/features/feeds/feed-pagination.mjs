export const FEED_PREFETCH_ROOT_MARGIN = "480px 0px";

export function canAutomaticallyLoadWebFeed(state) {
  return Boolean(
    state.nextCursor &&
    state.stopReason === null &&
    !state.loading &&
    state.busy === null &&
    !state.hasError,
  );
}

export function appendUniqueFeedItems(existing, incoming) {
  const seen = new Set(existing.map((item) => `${item.type}:${item.id}`));
  const result = [...existing];

  for (const item of incoming) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

export function feedPageLoadedAnnouncement(newItemCount) {
  if (!Number.isSafeInteger(newItemCount) || newItemCount < 0) return "";
  if (newItemCount === 0) {
    return "La siguiente página no agregó publicaciones nuevas.";
  }
  if (newItemCount === 1) return "Se agregó 1 publicación nueva.";
  return `Se agregaron ${newItemCount} publicaciones nuevas.`;
}

export function didFeedCursorAdvance(
  currentCursor,
  nextCursor,
  usedCursors = new Set(),
) {
  return (
    currentCursor !== nextCursor &&
    (nextCursor === null || !usedCursors.has(nextCursor))
  );
}

export function requiresNewWebFeedSession(errorCode) {
  return [
    "FEED_CURSOR_INVALID",
    "FEED_CURSOR_STALE",
    "FEED_CURSOR_CONTEXT_MISMATCH",
    "FEED_PREFERENCES_REVISION_CONFLICT",
  ].includes(errorCode);
}
