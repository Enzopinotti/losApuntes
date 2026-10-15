const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * A link is a discovery request, never proof that a question belongs to the
 * user's current academic context. An invalid focus must not broaden scope.
 */
export function practiceQuestionFromParams(params) {
  const values = params.getAll("questionId");
  if (values.length === 0) return { kind: "none" };
  if (values.length !== 1 || !UUID_V4.test(values[0])) {
    return { kind: "invalid" };
  }
  return { kind: "selected", questionId: values[0].toLowerCase() };
}

export function practiceQuestionHref(subjectId, questionId) {
  if (
    typeof subjectId !== "string" ||
    typeof questionId !== "string" ||
    !UUID_V4.test(subjectId) ||
    !UUID_V4.test(questionId)
  ) return null;

  const params = new URLSearchParams({
    subjectId: subjectId.toLowerCase(),
    questionId: questionId.toLowerCase(),
  });
  return `/study/practice?${params.toString()}`;
}

export function isPracticeQuestionForSubject(question, subjectId, questionId) {
  return (
    typeof subjectId === "string" &&
    typeof questionId === "string" &&
    UUID_V4.test(subjectId) &&
    UUID_V4.test(questionId) &&
    question?.id === questionId.toLowerCase() &&
    question?.academic?.subject?.id === subjectId.toLowerCase()
  );
}
