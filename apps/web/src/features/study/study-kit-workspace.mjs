const memory = new Map();
const MAX_SCOPES = 5;
const TTL = 30 * 60 * 1000;
export function saveStudyKitWorkspace(scope, archive, now = Date.now()) {
  if (typeof scope !== "string" || !scope.startsWith("authenticated:") ||
    scope.length > 512 || !Number.isSafeInteger(now)) return false;
  const text = JSON.stringify(archive);
  if (text.length > 65536) return false;
  for (const [key,value] of memory) {
    if (value.expiresAt <= now) memory.delete(key);
  }
  memory.delete(scope);
  while (memory.size >= MAX_SCOPES) memory.delete(memory.keys().next().value);
  memory.set(scope,{text,expiresAt:now+TTL});
  return true;
}
export function loadStudyKitWorkspace(scope, now = Date.now()) {
  const value = memory.get(scope);
  if (!value) return null;
  if (value.expiresAt <= now) {
    memory.delete(scope);
    return null;
  }
  try { return JSON.parse(value.text); } catch { memory.delete(scope);return null; }
}
export function forgetStudyKitWorkspace(scope) {
  return memory.delete(scope);
}
