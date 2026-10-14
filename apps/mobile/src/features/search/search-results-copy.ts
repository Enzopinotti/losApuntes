import type { SearchScope } from "@losapuntes/contracts";

export type SearchResultCounts = {
  resources: number;
  subjects: number;
  people: number;
};

export type SearchScopeRecoveryCopy = {
  message: string;
  actionLabel: string;
};

function visibleSearchResultCount(
  counts: SearchResultCounts,
  scope: SearchScope,
): number {
  return (
    (scope === "all" || scope === "resources" ? counts.resources : 0) +
    (scope === "all" || scope === "subjects" ? counts.subjects : 0) +
    (scope === "all" || scope === "people" ? counts.people : 0)
  );
}

export function searchResultSummary(
  counts: SearchResultCounts,
  scope: SearchScope,
): string {
  const visibleCount = visibleSearchResultCount(counts, scope);

  if (visibleCount === 0)
    return "No encontramos resultados para esta búsqueda.";
  return `Encontramos ${visibleCount} ${visibleCount === 1 ? "resultado" : "resultados"}.`;
}

export function searchScopeRecoveryCopy(
  counts: SearchResultCounts,
  scope: SearchScope,
  query: string,
): SearchScopeRecoveryCopy | null {
  const normalizedQuery = query.trim();
  if (
    scope === "all" ||
    normalizedQuery.length < 2 ||
    visibleSearchResultCount(counts, scope) !== 0
  ) {
    return null;
  }

  const scopeLabel =
    scope === "resources"
      ? "Apuntes"
      : scope === "subjects"
        ? "Materias"
        : "Personas";

  return {
    message: `No encontramos resultados para “${normalizedQuery}” en ${scopeLabel}.`,
    actionLabel: "Buscar en todo",
  };
}
