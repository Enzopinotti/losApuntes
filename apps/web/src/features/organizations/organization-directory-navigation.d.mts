export type OrganizationDirectoryFilters = Readonly<{
  q: string;
  type:
    | ""
    | "student_center"
    | "association"
    | "club"
    | "lab"
    | "research_group"
    | "alumni_association"
    | "incubator"
    | "cultural_sports"
    | "career_community";
  verificationState: "" | "verified" | "unverified";
  institutionId: string;
}>;

export const DIRECTORY_TYPES: readonly Exclude<OrganizationDirectoryFilters["type"], "">[];

export function organizationDirectoryFiltersFromParams(
  params: URLSearchParams,
): OrganizationDirectoryFilters | null;

export function organizationDirectorySearchParams(
  params: URLSearchParams,
  query: string,
  type: OrganizationDirectoryFilters["type"],
  verificationState: OrganizationDirectoryFilters["verificationState"],
): URLSearchParams | null;

export function organizationDirectoryInstitutionParams(
  params: URLSearchParams,
  institutionId: string | null,
): URLSearchParams | null;

export function organizationDirectoryClearParams(
  params: URLSearchParams,
): URLSearchParams;

export function organizationDirectoryListHref(
  params: URLSearchParams,
): string | null;
