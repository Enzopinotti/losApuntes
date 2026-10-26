const CANONICAL_PROFILE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function publicProfileShareUrl(
  profileId: string,
  origin: string,
): string | null {
  if (!CANONICAL_PROFILE_ID.test(profileId)) return null;

  try {
    const base = new URL(origin);
    if (
      !["https:", "http:"].includes(base.protocol) ||
      base.username ||
      base.password
    ) {
      return null;
    }

    return new URL(
      `/p/${encodeURIComponent(profileId)}`,
      base.origin,
    ).toString();
  } catch {
    return null;
  }
}
