const MAX_PUBLIC_ACTIVITY_URL_LENGTH = 2048;

export type PublicProfileActivityLink = {
  href: string;
  hostname: string;
};

export function publicProfileActivityLink(
  value: string | null | undefined,
): PublicProfileActivityLink | null {
  if (
    !value ||
    value.length < 8 ||
    value.length > MAX_PUBLIC_ACTIVITY_URL_LENGTH
  ) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }

    return { href: parsed.toString(), hostname: parsed.hostname };
  } catch {
    return null;
  }
}
