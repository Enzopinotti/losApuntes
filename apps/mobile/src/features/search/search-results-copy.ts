import type { SearchScope } from "@losapuntes/contracts";

export type SearchResultCounts = {
  resources: number;
  subjects: number;
  people: number;
};

export function searchResultSummary(
  counts: SearchResultCounts,
  scope: SearchScope,
): string {
  const visibleCount =
    (scope === "all" || scope === "resources" ? counts.resources : 0) +
    (scope === "all" || scope === "subjects" ? counts.subjects : 0) +
    (scope === "all" || scope === "people" ? counts.people : 0);

  if (visibleCount === 0)
    return "No encontramos resultados para esta búsqueda.";
  return `Encontramos ${visibleCount} ${visibleCount === 1 ? "resultado" : "resultados"}.`;
}
