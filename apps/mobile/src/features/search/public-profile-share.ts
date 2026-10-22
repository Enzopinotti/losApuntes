const PROFILE_UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PUBLIC_PROFILE_LINK_PREFIX = "losapuntes:///profiles/";

export function publicProfileShareUrl(profileId: string): string | null {
  if (!PROFILE_UUID_V4.test(profileId)) return null;
  return `${PUBLIC_PROFILE_LINK_PREFIX}${profileId.toLocaleLowerCase("en-US")}`;
}
