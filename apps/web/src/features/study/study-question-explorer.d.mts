import type { QuestionState } from "../community/interfaces";

export const STUDY_QUESTION_QUERY_MAX_LENGTH: 120;

export type StudyQuestionFilter = {
  q: string;
  status: QuestionState | "";
};

export const DEFAULT_STUDY_QUESTION_FILTER: Readonly<{
  q: "";
  status: "open";
}>;

export function normalizeStudyQuestionFilter(
  input: unknown,
): StudyQuestionFilter | null;

export function studyQuestionFilterKey(
  viewerAndSubjectScope: string,
  filter: StudyQuestionFilter,
): string | null;
