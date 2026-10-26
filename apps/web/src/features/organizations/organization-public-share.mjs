const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const organizationPublicPath = (organizationId) => {
  if (
    typeof organizationId !== 'string' ||
    !UUID_V4_PATTERN.test(organizationId)
  ) {
    return null;
  }

  return `/organizations/${organizationId.toLowerCase()}`;
};
