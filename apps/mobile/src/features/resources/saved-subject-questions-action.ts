import type { ResourceView } from "@losapuntes/contracts";
import type { Href } from "expo-router";

import { subjectQuestionsRouteId } from "@/features/community/subject-questions-policy";

export interface SavedSubjectQuestionsAction {
  href: Href;
  accessibilityLabel: string;
  accessibilityHint: string;
}

/**
 * The resource projection supplies a canonical Subject ID. The route only
 * selects a feed: it grants no academic participation or publishing right.
 */
export function savedSubjectQuestionsAction(
  resource: Pick<ResourceView, "academic">,
): SavedSubjectQuestionsAction | null {
  const subjectId = subjectQuestionsRouteId(resource.academic.subject.id);
  if (!subjectId) return null;

  const name = resource.academic.subject.name.trim() || "esta materia";
  return {
    href: {
      pathname: "/questions/subjects/[subjectId]",
      params: { subjectId },
    },
    accessibilityLabel: `Ver preguntas de ${name}`,
    accessibilityHint:
      "Abre las preguntas disponibles de la materia. El servidor vuelve a validar lectura y contexto para publicar.",
  };
}
