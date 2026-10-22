export const STUDY_MATERIAL_SEARCH_MAX_LENGTH = 120;
export const STUDY_MATERIAL_SEARCH_DEFAULTS = Object.freeze({
  kind: "resource",
  q: "",
  status: "",
});

export function normalizeStudyMaterialSearchFilter(value) {
  if (!value || typeof value.q !== "string") return null;
  if (value.kind !== "resource" && value.kind !== "question") return null;
  if (!["", "open", "closed"].includes(value.status)) return null;
  if (value.kind === "resource" && value.status !== "") return null;
  const q = value.q.normalize("NFC").trim();
  if (q.length < 2 || q.length > STUDY_MATERIAL_SEARCH_MAX_LENGTH) {
    return null;
  }
  for (const character of q) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return null;
  }
  return { kind: value.kind, status: value.status, q };
}

export function studyMaterialSearchKey(scope, filter) {
  const normalized = normalizeStudyMaterialSearchFilter(filter);
  if (typeof scope !== "string" || scope.length < 5 || !normalized) {
    return null;
  }
  return JSON.stringify([scope, normalized.kind, normalized.q, normalized.status]);
}

export function materialTaskMinutes(kind) {
  if (kind === "resource") return 25;
  if (kind === "question") return 20;
  return null;
}

export function mayAddStudyMaterial(
  kind,
  id,
  existingKeys,
  count,
  minutesRemaining,
  maxTasks,
) {
  const duration = materialTaskMinutes(kind);
  return Boolean(
    duration !== null &&
      typeof id === "string" &&
      id.length > 0 &&
      existingKeys instanceof Set &&
      !existingKeys.has(kind + ":" + id) &&
      Number.isSafeInteger(count) &&
      count >= 0 &&
      count < maxTasks &&
      Number.isFinite(minutesRemaining) &&
      minutesRemaining >= duration,
  );
}
