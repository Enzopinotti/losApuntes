import { normalizeStudySession } from "./study-session-plan.mjs";

/**
 * Revalidate each opaque study reference against its authoritative domain API.
 * At most four requests run concurrently, even for a maximum-size plan.
 * The caller owns the authorization check and the lifetime of isCurrent.
 * Stale/aborted loads return null and never publish partial results.
 */
export async function verifyStudyTaskLabels(source, verifyTask, isCurrent) {
  const plan = normalizeStudySession(source);
  if (typeof verifyTask !== "function" || typeof isCurrent !== "function") {
    throw new Error("STUDY_TASK_VERIFICATION_INVALID");
  }

  const labels = {};
  let nextIndex = 0;

  const worker = async () => {
    while (isCurrent() && nextIndex < plan.tasks.length) {
      const task = plan.tasks[nextIndex++];
      const label = await verifyTask(task);
      if (!isCurrent()) return;
      if (label !== null && typeof label !== "string") {
        throw new Error("STUDY_TASK_VERIFICATION_INVALID");
      }
      labels[task.kind + ":" + task.id] = label;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(4, plan.tasks.length) }, () => worker()),
  );
  return isCurrent() ? labels : null;
}
