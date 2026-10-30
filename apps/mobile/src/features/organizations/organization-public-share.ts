const ORGANIZATION_UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function mobileOrganizationPublicLink(
  organizationId: string,
): string | null {
  if (!ORGANIZATION_UUID_V4_PATTERN.test(organizationId)) return null;
  return `losapuntes:///organizations/${organizationId.toLowerCase()}`;
}
