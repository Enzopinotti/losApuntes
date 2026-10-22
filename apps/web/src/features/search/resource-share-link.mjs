// Only a canonical public resource identifier may be put on the clipboard.
// A link never grants access; the resource detail must authorize on open.
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function shareableResourceHref(resourceId) {
  if (typeof resourceId !== "string" || !UUID_V4.test(resourceId)) return null;
  return `/resources/${encodeURIComponent(resourceId)}`;
}

export function shareableResourceUrl(resourceId, origin) {
  const href = shareableResourceHref(resourceId);
  if (!href || typeof origin !== "string") return null;

  try {
    const base = new URL(origin);
    if (
      !["https:", "http:"].includes(base.protocol) ||
      base.origin !== origin
    ) {
      return null;
    }
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
