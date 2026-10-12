export function notificationTargetPath(target) {
  if (typeof target !== "object" || target === null) return null;
  if (typeof target.id !== "string" || target.id.trim().length === 0) {
    return null;
  }

  switch (target.type) {
    case "profile":
      return `/p/${encodeURIComponent(target.id)}`;
    case "question":
      return `/questions?id=${encodeURIComponent(target.id)}`;
    case "connection":
      return "/network";
    default:
      return null;
  }
}
