const MAX_SCROLL_POSITIONS = 32;
const MAX_RESTORE_KEY_LENGTH = 128;
const scrollPositions = new Map();

function isRestoreKey(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_RESTORE_KEY_LENGTH &&
    !/[\u0000-\u001f]/u.test(value)
  );
}

function isFeedHref(value) {
  return (
    value === "/" ||
    (typeof value === "string" &&
      /^\/feeds(?:\?[^#\\\u0000-\u001f]*)?$/u.test(value))
  );
}

function positionId(key, authorityScope) {
  return JSON.stringify([authorityScope, key]);
}

export function feedScrollAuthorityScope(status, userId, sessionId) {
  return JSON.stringify([
    typeof status === "string" ? status : "unknown",
    typeof userId === "string" ? userId : "anonymous",
    typeof sessionId === "string" ? sessionId : "no-session",
  ]);
}

export function rememberFeedScrollPosition(key, authorityScope, scrollY) {
  if (
    !isRestoreKey(key) ||
    typeof authorityScope !== "string" ||
    !Number.isFinite(scrollY) ||
    scrollY < 0
  ) {
    return false;
  }

  const id = positionId(key, authorityScope);
  scrollPositions.delete(id);
  scrollPositions.set(id, scrollY);
  while (scrollPositions.size > MAX_SCROLL_POSITIONS) {
    const oldest = scrollPositions.keys().next().value;
    if (oldest === undefined) break;
    scrollPositions.delete(oldest);
  }
  return true;
}

export function takeFeedScrollPosition(key, authorityScope) {
  if (!isRestoreKey(key) || typeof authorityScope !== "string") return null;
  const id = positionId(key, authorityScope);
  const scrollY = scrollPositions.get(id);
  if (scrollY === undefined) return null;
  scrollPositions.delete(id);
  return scrollY;
}

export function clearFeedScrollPositions() {
  scrollPositions.clear();
}

export function feedRestorePositionKey(locationState, currentHref) {
  if (
    typeof locationState !== "object" ||
    locationState === null ||
    !isFeedHref(currentHref) ||
    locationState.feedRestoreTo !== currentHref
  ) {
    return null;
  }

  return isRestoreKey(locationState.feedRestoreKey)
    ? locationState.feedRestoreKey
    : null;
}
