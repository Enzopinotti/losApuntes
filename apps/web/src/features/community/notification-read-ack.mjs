/** The API must explicitly acknowledge a single owner-scoped read. */
export function isNotificationReadConfirmed(value) {
  return typeof value === "object" && value !== null && value.read === true;
}

/** A legitimate read-all may update zero rows: zero is still a valid ACK. */
export function isNotificationReadAllConfirmed(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isSafeInteger(value.updated) &&
    value.updated >= 0
  );
}

/**
 * A 4xx other than timeout/throttling definitively rejects the mutation.
 * Network loss, 408/429, server errors and malformed success responses leave
 * the commit outcome unknown. Never automatically resend an uncertain write.
 */
export function isNotificationMutationUncertain(error) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : null;
  return (
    typeof status !== "number" ||
    status < 400 ||
    status >= 500 ||
    status === 408 ||
    status === 429
  );
}
