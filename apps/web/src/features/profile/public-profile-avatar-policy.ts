const MAX_PUBLIC_AVATAR_URL_LENGTH = 2048;

export function publicProfileAvatarUrl(
  value: string | null | undefined,
): string | null {
  if (
    !value ||
    value.length > MAX_PUBLIC_AVATAR_URL_LENGTH ||
    value.trim() !== value
  ) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
