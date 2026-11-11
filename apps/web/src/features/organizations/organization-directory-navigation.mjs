// Public directory filters are validated against the same bounds and enum
// values as OrganizationSearchDto. Duplicate/malformed filters fail closed.
export const DIRECTORY_TYPES = Object.freeze([
  "student_center",
  "association",
  "club",
  "lab",
  "research_group",
  "alumni_association",
  "incubator",
  "cultural_sports",
  "career_community",
]);

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function organizationDirectoryFiltersFromParams(params) {
  const keys = ["q", "type", "verificationState", "institutionId"];
  if (keys.some((key) => params.getAll(key).length > 1)) return null;
  const q = params.get("q")?.trim() ?? "";
  const type = params.get("type") ?? "";
  const verificationState = params.get("verificationState") ?? "";
  const institutionId = params.get("institutionId") ?? "";

  if (
    (params.has("q") && (q.length < 2 || q.length > 120)) ||
    (type && !DIRECTORY_TYPES.includes(type)) ||
    (params.has("type") && !type) ||
    (verificationState !== "" &&
      verificationState !== "verified" &&
      verificationState !== "unverified") ||
    (params.has("verificationState") && !verificationState) ||
    (params.has("institutionId") && !UUID_V4.test(institutionId))
  ) {
    return null;
  }

  return {
    q,
    type,
    verificationState,
    institutionId: institutionId.toLowerCase(),
  };
}

export function organizationDirectorySearchParams(params, query, type, verificationState) {
  const q = typeof query === "string" ? query.trim() : "";
  if (
    (q.length > 0 && (q.length < 2 || q.length > 120)) ||
    (type !== "" && !DIRECTORY_TYPES.includes(type)) ||
    (verificationState !== "" &&
      verificationState !== "verified" &&
      verificationState !== "unverified")
  ) {
    return null;
  }
  const next = new URLSearchParams(params);
  next.delete("q");
  next.delete("type");
  next.delete("verificationState");
  if (q) next.set("q", q);
  if (type) next.set("type", type);
  if (verificationState) next.set("verificationState", verificationState);
  return next;
}

export function organizationDirectoryInstitutionParams(params, institutionId) {
  if (institutionId !== null && !UUID_V4.test(institutionId)) return null;
  const next = new URLSearchParams(params);
  next.delete("institutionId");
  if (institutionId) next.set("institutionId", institutionId.toLowerCase());
  return next;
}

export function organizationDirectoryClearParams(params) {
  const next = new URLSearchParams(params);
  for (const key of ["q", "type", "verificationState", "institutionId"]) {
    next.delete(key);
  }
  return next;
}

// A public URL must not leak a cursor, auth token, internal detail identifier,
// or unrelated route state. Only explicit validated discovery filters survive.
export function organizationDirectoryListHref(params) {
  const filters = organizationDirectoryFiltersFromParams(params);
  if (!filters) return null;
  const shared = new URLSearchParams();
  if (filters.q) shared.set("q", filters.q);
  if (filters.type) shared.set("type", filters.type);
  if (filters.verificationState) {
    shared.set("verificationState", filters.verificationState);
  }
  if (filters.institutionId) shared.set("institutionId", filters.institutionId);
  const suffix = shared.toString();
  return suffix ? `/organizations?${suffix}` : "/organizations";
}
