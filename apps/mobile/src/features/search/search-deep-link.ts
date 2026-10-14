import type { SearchScope } from "@losapuntes/contracts";

import { subjectResourcesSearchRouteId } from "./search-subject-navigation";
import type { MobileSearchInput } from "./search-api";

export type MobileSearchLinkParams = {
  q?: string | string[] | undefined;
  scope?: string | string[] | undefined;
  subjectId?: string | string[] | undefined;
};

const SCOPES = new Set<SearchScope>(["all", "resources", "subjects", "people"]);

const SEARCH_SCHEME = "losapuntes:///search";

/**
 * Deep links request search, not identity or academic entitlement.
 * Invalid scope or subject combinations MUST fail closed, never silently
 * broaden to a global search.
 */
export function parseMobileSearchLink(
  params: MobileSearchLinkParams,
): MobileSearchInput | null {
  if (
    Array.isArray(params.q) ||
    Array.isArray(params.scope) ||
    Array.isArray(params.subjectId)
  ) {
    return null;
  }

  const hasSubject = params.subjectId !== undefined;
  const subjectId = hasSubject
    ? subjectResourcesSearchRouteId(params.subjectId)
    : null;
  if (hasSubject && !subjectId) return null;

  const scope = params.scope ?? (subjectId ? "resources" : "all");
  if (!SCOPES.has(scope as SearchScope)) return null;
  if (subjectId && scope !== "resources") return null;

  const text = params.q;
  if (text !== undefined) {
    if (typeof text !== "string") return null;
    const q = text.trim();
    if (q.length < 2 || q.length > 120 || /[\u0000-\u001f\u007f]/u.test(q)) {
      return null;
    }
    return {
      q,
      scope: scope as SearchScope,
      ...(subjectId ? { subjectId } : {}),
    };
  }

  if (subjectId && scope === "resources") {
    return { scope: "resources", subjectId };
  }
  return null;
}

/**
 * A user-triggered share creates a custom-scheme link for the installed app.
 * It contains only query, public scope and optional canonical subject UUID.
 * No session, account identity, private subject name or saved results.
 */
export function mobileSearchShareUrl(input: MobileSearchInput): string | null {
  const checked = parseMobileSearchLink(input);
  if (!checked) return null;

  const params = new URLSearchParams();
  if (checked.q) params.set("q", checked.q);
  params.set("scope", checked.scope);
  if (checked.subjectId) params.set("subjectId", checked.subjectId);
  return `${SEARCH_SCHEME}?${params.toString()}`;
}

export function mobileSearchLinkKey(input: MobileSearchInput): string {
  return JSON.stringify([
    input.q ?? null,
    input.scope,
    input.subjectId ?? null,
  ]);
}
