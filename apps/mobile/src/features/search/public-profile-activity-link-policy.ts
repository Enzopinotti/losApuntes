const MAX_PUBLIC_ACTIVITY_URL_LENGTH = 2048;

export function publicProfileActivityExternalUrl(
  value: string | null | undefined,
): string | null {
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

    return parsed.toString();
  } catch {
    return null;
  }
}
