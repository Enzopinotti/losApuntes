export const STUDY_QUESTION_QUERY_MAX_LENGTH = 120;

export const DEFAULT_STUDY_QUESTION_FILTER = Object.freeze({
  q: "",
  status: "open",
});

/**
 * The Q&A API accepts either no search query or 2–120 characters.
 * Reject malformed filters instead of broadening a requested search.
 */
export function normalizeStudyQuestionFilter(input) {
  if (!input || typeof input.q !== "string") return null;
  if (!["", "open", "closed"].includes(input.status)) return null;
  const q = input.q.trim();
  if (
    (q.length > 0 && q.length < 2) ||
    q.length > STUDY_QUESTION_QUERY_MAX_LENGTH ||
    [...q].some((character) => {
      const codePoint = character.charCodeAt(0);
      return codePoint < 32 || codePoint === 127;
    })
  ) {
    return null;
  }
  return { q, status: input.status };
}

export function studyQuestionFilterKey(viewerAndSubjectScope, filter) {
  if (!normalizeStudyQuestionFilter(filter)) return null;
  return JSON.stringify([
    viewerAndSubjectScope,
    filter.q,
    filter.status,
  ]);
}
