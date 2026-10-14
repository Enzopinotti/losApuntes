import type {
  AcademicCurrentContext,
  AcademicSubjectParticipation,
  ResourceView,
} from "@losapuntes/contracts";

import { subjectQuestionsRouteId } from "@/features/community/subject-questions-policy";

export interface HomeSelectedSubject {
  subjectId: string;
  name: string;
}

/**
 * Context stores participationId, not subjectId. Never correlate by matching
 * names; resolve the selected participation in the authenticated academic
 * snapshot before deriving navigation or a display preference.
 */
export function homeSelectedCurrentSubject(
  context: AcademicCurrentContext | null,
  participations: readonly AcademicSubjectParticipation[],
): HomeSelectedSubject | null {
  const participationId = context?.subjectParticipationId;
  if (!participationId) return null;
  const participation = participations.find(
    (item) => item.id === participationId && item.state === "current",
  );
  if (!participation) return null;
  const subjectId = subjectQuestionsRouteId(participation.subjectId);
  if (!subjectId) return null;
  return {
    subjectId,
    name: participation.subjectName.trim() || "tu materia actual",
  };
}

export interface HomeRecentAcademicGroup {
  current: ResourceView[];
  other: ResourceView[];
}

/**
 * Only call with recently re-authorized ResourceView projections, not
 * unverified IDs from session memory. MRU order remains stable within each
 * group and the current subject gets priority in the four-card preview.
 */
export function groupHomeRecentlyOpened(
  resources: readonly ResourceView[],
  selectedSubjectId: string | null,
): HomeRecentAcademicGroup {
  if (!selectedSubjectId) return { current: [], other: [...resources] };
  const current: ResourceView[] = [];
  const other: ResourceView[] = [];
  for (const resource of resources) {
    if (resource.academic.subject.id === selectedSubjectId) {
      current.push(resource);
    } else {
      other.push(resource);
    }
  }
  return { current, other };
}

export function prioritizeHomeRecentlyOpened(
  resources: readonly ResourceView[],
  selectedSubjectId: string | null,
  limit: number,
): ResourceView[] {
  const { current, other } = groupHomeRecentlyOpened(resources, selectedSubjectId);
  return [...current, ...other].slice(0, Math.max(0, Math.trunc(limit)));
}
