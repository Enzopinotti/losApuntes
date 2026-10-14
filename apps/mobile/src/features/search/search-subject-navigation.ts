import type { Href } from "expo-router";

import { subjectQuestionsRouteId } from "@/features/community/subject-questions-policy";

export interface SubjectResourcesSearchAction {
  href: Href;
  accessibilityLabel: string;
  accessibilityHint: string;
}

/**
 * Navigation is only a request to search, NEVER an authorization grant.
 * Keep the route payload to a canonical Subject UUID. Do not put an
 * untrusted academic name, private projection or credential in the URL.
 */
export function subjectResourcesSearchAction(input: {
  subjectId: string;
  subjectName?: string;
}): SubjectResourcesSearchAction | null {
  const subjectId = subjectQuestionsRouteId(input.subjectId);
  if (!subjectId) return null;
  const name =
    typeof input.subjectName === "string"
      ? input.subjectName.trim().replace(/\s+/gu, " ").slice(0, 80)
      : "";
  return {
    href: {
      pathname: "/(tabs)/search",
      params: { subjectId },
    },
    accessibilityLabel: `Explorar apuntes de ${name || "esta materia"}`,
    accessibilityHint:
      "Abre Buscar con el filtro de materia. Los permisos y la disponibilidad se verifican desde el servidor.",
  };
}

/** A raw deep-link parameter is never an academic permission or identity. */
export function subjectResourcesSearchRouteId(
  param: string | string[] | undefined,
): string | null {
  return subjectQuestionsRouteId(param);
}
