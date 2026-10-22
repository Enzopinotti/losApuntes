import type { ProfileSection } from "./interfaces";

export function moveProfileSectionOrder(
  order: readonly ProfileSection[],
  section: ProfileSection,
  offset: -1 | 1,
): ProfileSection[] {
  const index = order.indexOf(section);
  const targetIndex = index + offset;
  if (index < 0 || targetIndex < 0 || targetIndex >= order.length) {
    return [...order];
  }

  const next = [...order];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}
