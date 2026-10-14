/**
 * Temporarily suspends Mongo's TTL monitor around a disposable local smoke
 * fixture. Restores the original setting even if disabling or the check fails.
 * Caller owns enforcing a local-only environment.
 */
export async function withTtlMonitorPaused(
  { readEnabled, setEnabled },
  operation,
) {
  const initiallyEnabled = await readEnabled();
  if (typeof initiallyEnabled !== "boolean") {
    throw new Error("TTL monitor state must be a boolean");
  }

  try {
    if (initiallyEnabled) await setEnabled(false);
    return await operation();
  } finally {
    if (initiallyEnabled) await setEnabled(true);
  }
}
