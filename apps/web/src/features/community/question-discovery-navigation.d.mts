import type { QuestionState } from "./interfaces";

export type QuestionDiscoverySelection = Readonly<{
  q: string;
  status: QuestionState | "";
  subjectId: string;
}>;

export declare const EMPTY_QUESTION_DISCOVERY: QuestionDiscoverySelection;

export declare function questionDiscoverySelectionFromParams(params: {
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
}): QuestionDiscoverySelection | null;

export declare function questionDiscoveryHref(
  selection: QuestionDiscoverySelection,
  questionId?: string,
): string | null;

export declare function questionDiscoverySelectionKey(
  selection: QuestionDiscoverySelection | null,
): string | null;
