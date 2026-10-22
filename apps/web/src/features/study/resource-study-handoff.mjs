import { emptyStudySession, normalizeStudySession } from "./study-session-plan.mjs";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function normalizedUuid(value) {
  return typeof value === "string" && UUID_V4.test(value)
    ? value.toLowerCase()
    : null;
}

/**
 * Prepare a one-resource plan only for a freshly verified resource and one
 * subject in the same user's current authoritative contextual discovery.
 * The handoff contains identifiers and user-editable defaults, never labels,
 * file links, permissions or another user's profile fields.
 */
export function resourceToStudyHandoffPlan(
  resource,
  contextual,
  expectedResourceId,
) {
  const expectedId = normalizedUuid(expectedResourceId);
  const resourceId = normalizedUuid(resource?.id);
  const subjectId = normalizedUuid(resource?.academic?.subject?.id);

  if (
    !expectedId ||
    !resourceId ||
    !subjectId ||
    expectedId !== resourceId ||
    !Array.isArray(contextual?.subjects) ||
    !contextual.subjects.some(
      (bucket) => normalizedUuid(bucket?.subject?.id) === subjectId,
    )
  ) {
    return null;
  }

  const plan = emptyStudySession(subjectId);
  return normalizeStudySession({
    ...plan,
    tasks: [{ kind: "resource", id: resourceId, minutes: 25, done: false }],
  });
}
