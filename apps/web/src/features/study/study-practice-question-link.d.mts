import type { QuestionView } from "../community/interfaces";

export type PracticeQuestionSelection =
  | Readonly<{ kind: "none" | "invalid" }>
  | Readonly<{ kind: "selected"; questionId: string }>;

export declare function practiceQuestionFromParams(params: {
  getAll(name: string): string[];
}): PracticeQuestionSelection;

export declare function practiceQuestionHref(
  subjectId: string,
  questionId: string,
): string | null;

export declare function isPracticeQuestionForSubject(
  question: QuestionView | null | undefined,
  subjectId: string,
  questionId: string,
): boolean;
