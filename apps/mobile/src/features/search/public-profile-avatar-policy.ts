export function publicProfileAvatarUri(
  avatarUrl: string | null | undefined,
): string | null {
  if (!avatarUrl || avatarUrl.length > 2048) return null;

  try {
    const parsed = new URL(avatarUrl);
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

export function publicProfileAvatarInitial(displayName: string): string {
  const firstCharacter = Array.from(displayName.trim())[0];
  return firstCharacter?.toLocaleUpperCase("es-AR") ?? "·";
}
