// DELETE may have reached the server even if the response was lost.
// Only an explicit fresh GET can settle a single-session uncertainty.
export function isUncertainSessionRevocationError(error) {
  if (error === null || typeof error !== "object") return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  if (error.code === "INVALID_RESPONSE" || error.code === "NETWORK_UNAVAILABLE") {
    return true;
  }
  const status = error.status;
  return (
    typeof status === "number" &&
    (status === 0 || status === 408 || status === 429 || status >= 500)
  );
}

// The auth session inventory is bounded. Missing from a *truncated* list
// never confirms that the target was revoked.
export function isValidSessionInventory(snapshot) {
  return !(
    snapshot === null ||
    typeof snapshot !== "object" ||
    !Array.isArray(snapshot.sessions) ||
    typeof snapshot.truncated !== "boolean" ||
    !Number.isSafeInteger(snapshot.limit) ||
    snapshot.limit < 1 ||
    snapshot.sessions.some(
      (session) =>
        session === null ||
        typeof session !== "object" ||
        typeof session.id !== "string" ||
        !session.id ||
        (session.clientType !== "web" && session.clientType !== "mobile") ||
        typeof session.current !== "boolean" ||
        !["createdAt", "lastSeenAt", "expiresAt"].every(
          (key) =>
            typeof session[key] === "string" &&
            !Number.isNaN(Date.parse(session[key])),
        ),
    )
  );
}

export function sessionRevocationReconciliation(targetId, snapshot) {
  if (typeof targetId !== "string" || !targetId || !isValidSessionInventory(snapshot)) {
    return "unknown";
  }

  if (snapshot.sessions.some((session) => session.id === targetId)) {
    return "active";
  }

  return snapshot.truncated ? "unknown" : "revoked";
}
