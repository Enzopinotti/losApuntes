export type StudySubjectSelection =
  | { kind: "unselected" }
  | { kind: "invalid" }
  | { kind: "selected"; subjectId: string };

export type StudySubjectResolution =
  | { kind: "invalid" | "no-context" | "unavailable" }
  | { kind: "ready"; subject: { id: string; name: string } };

export declare function studySubjectSelectionFromParams(
  params: URLSearchParams,
): StudySubjectSelection;

export declare function studySubjectHref(subjectId: string): string | null;

export declare function resolveStudySubject(
  selection: StudySubjectSelection,
  buckets: ReadonlyArray<{
    subject: { id: string; name: string };
  }>,
): StudySubjectResolution;
