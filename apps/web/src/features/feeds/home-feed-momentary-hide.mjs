/**
 * A short-lived, account/session-scoped home-preview dismissal.
 * This is a client-only visibility projection, NOT feed moderation,
 * preference feedback or an access-control filter.
 */
const ALLOWED_TYPES = new Set(["resource", "question", "organization_post"]);
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/iu;
export const HOME_DISMISS_LIMIT = 16;

export function homeFeedItemKey(item) {
  if (
    !item ||
    !ALLOWED_TYPES.has(item.type) ||
    typeof item.id !== "string" ||
    !ID_PATTERN.test(item.id)
  ) {
    throw new TypeError("Unsupported home feed item identity");
  }
  return item.type + ":" + item.id.toLowerCase();
}

export function projectHomeFeed(items, hiddenKeys) {
  if (
    !Array.isArray(items) ||
    !Array.isArray(hiddenKeys) ||
    items.length > HOME_DISMISS_LIMIT ||
    hiddenKeys.length > HOME_DISMISS_LIMIT ||
    hiddenKeys.some((value) => typeof value !== "string")
  ) {
    throw new TypeError("Invalid bounded home preview");
  }
  const valid = new Set(items.map(homeFeedItemKey));
  const hidden = new Set(hiddenKeys.filter((key) => valid.has(key)));
  return Object.freeze({
    visible: items.filter((item) => !hidden.has(homeFeedItemKey(item))),
    hiddenCount: hidden.size,
  });
}

export function hideHomeFeedItem(items, hiddenKeys, item) {
  const key = homeFeedItemKey(item);
  const current = projectHomeFeed(items, hiddenKeys);
  if (!items.some((candidate) => homeFeedItemKey(candidate) === key)) {
    throw new Error("Cannot hide an item outside current visible preview");
  }
  if (hiddenKeys.includes(key)) return hiddenKeys;
  if (current.hiddenCount >= HOME_DISMISS_LIMIT) {
    throw new RangeError("Preview hide limit reached");
  }
  return [
    ...hiddenKeys.filter((value) =>
      items.some((candidate) => homeFeedItemKey(candidate) === value),
    ),
    key,
  ];
}

export function undoHomeFeedHide(hiddenKeys, key) {
  if (!Array.isArray(hiddenKeys) || typeof key !== "string") {
    throw new TypeError("Invalid undo request");
  }
  return hiddenKeys.filter((value) => value !== key);
}
