/** Only a UUIDv4 resource path, never a capability URL. */
export declare function shareableResourceHref(
  resourceId: unknown,
): string | null;

/** Absolute same-origin URL derived only from a verified public resource ID. */
export declare function shareableResourceUrl(
  resourceId: unknown,
  origin: unknown,
): string | null;

/** A subject's public-filtered resource listing, not a user's private classes. */
export declare function shareableSubjectResourcesHref(
  subjectId: unknown,
): string | null;

export declare function shareableSubjectResourcesUrl(
  subjectId: unknown,
  origin: unknown,
): string | null;

/** Link to a public Profile UUID. Never an account identifier or a grant. */
export declare function shareablePublicProfileHref(
  profileId: unknown,
): string | null;

export declare function shareablePublicProfileUrl(
  profileId: unknown,
  origin: unknown,
): string | null;
