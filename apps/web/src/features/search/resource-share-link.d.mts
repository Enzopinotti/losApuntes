/** Only a UUIDv4 resource path, never a capability URL. */
export declare function shareableResourceHref(
  resourceId: unknown,
): string | null;

/** Absolute same-origin URL derived only from a verified public resource ID. */
export declare function shareableResourceUrl(
  resourceId: unknown,
  origin: unknown,
): string | null;
