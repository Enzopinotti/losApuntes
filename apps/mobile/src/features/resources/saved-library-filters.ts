import type { ResourceView } from "@losapuntes/contracts";

export type SavedLibrarySort = "saved" | "title";

export const SAVED_LIBRARY_QUERY_MAX_LENGTH = 120;

export interface SavedLibrarySubject {
  id: string;
  name: string;
  loadedCount: number;
}

/**
 * A subject is identified by its academic ID, never its display name:
 * multiple institutions can use the same subject name.
 *
 * Counts include only server-authorized resources loaded so far.
 */
export function loadedSavedLibrarySubjects(
  resources: ReadonlyArray<ResourceView>,
): SavedLibrarySubject[] {
  const byId = new Map<string, SavedLibrarySubject>();

  for (const resource of resources) {
    const { id, name } = resource.academic.subject;
    const existing = byId.get(id);
    if (existing) {
      existing.loadedCount += 1;
    } else {
      byId.set(id, { id, name, loadedCount: 1 });
    }
  }

  return [...byId.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "es-AR", { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
}

export function activeLoadedSavedSubject(
  subjects: ReadonlyArray<SavedLibrarySubject>,
  subjectId: string | null,
): string | null {
  return subjectId && subjects.some((subject) => subject.id === subjectId)
    ? subjectId
    : null;
}

function searchableText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Searches only resources already returned by the saved-resources endpoint.
 * This is intentionally not a server-wide search: nextCursor may hide
 * additional matches until the student explicitly loads another page.
 */
export function findLoadedSavedResources(
  resources: ReadonlyArray<ResourceView>,
  rawQuery: string,
  sort: SavedLibrarySort,
  subjectId: string | null = null,
): ResourceView[] {
  const words = searchableText(
    rawQuery.slice(0, SAVED_LIBRARY_QUERY_MAX_LENGTH),
  )
    .split(" ")
    .filter(Boolean);

  const results = resources.filter((resource) => {
    if (subjectId && resource.academic.subject.id !== subjectId) return false;
    if (words.length === 0) return true;

    const searchable = searchableText(
      [
        resource.title,
        resource.description ?? "",
        resource.academic.subject.name,
        resource.author?.displayName ?? "",
        ...resource.tags,
      ].join(" "),
    );
    return words.every((word) => searchable.includes(word));
  });

  if (sort === "title") {
    results.sort(
      (a, b) =>
        a.title.localeCompare(b.title, "es-AR", { sensitivity: "base" }) ||
        a.id.localeCompare(b.id),
    );
  }

  return results;
}

export function loadedSavedSearchSummary(
  shown: number,
  loaded: number,
  moreAvailable: boolean,
): string {
  const suffix = moreAvailable ? " Hay más guardados por cargar." : "";
  return `${shown} de ${loaded} guardados cargados.${suffix}`;
}
