export type QuestionDiscoveryFilters = Readonly<{
  q: string;
  status: "" | "open" | "closed";
}>;

export function questionDiscoveryFiltersFromParams(
  params: URLSearchParams,
): QuestionDiscoveryFilters | null;

export function questionDiscoverySearchParams(
  params: URLSearchParams,
  query: string,
  status: "" | "open" | "closed",
): URLSearchParams | null;

export function questionDiscoveryClearParams(
  params: URLSearchParams,
): URLSearchParams;

export function questionDiscoveryListHref(
  params: URLSearchParams,
): string | null;
