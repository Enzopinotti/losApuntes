import type { ProfileSection } from "./interfaces";

export type PublicProfileContentSection = Exclude<
  ProfileSection,
  "about" | "contributions"
>;

const CONTENT_SECTIONS = new Set<ProfileSection>([
  "professional",
  "learning",
  "skills",
  "academic",
  "activities",
]);

export function publicProfileContentSectionOrder(
  sectionOrder: readonly ProfileSection[],
  availableSections: ReadonlySet<ProfileSection>,
): PublicProfileContentSection[] {
  const seen = new Set<ProfileSection>();

  return sectionOrder.filter(
    (section): section is PublicProfileContentSection => {
      if (
        !CONTENT_SECTIONS.has(section) ||
        !availableSections.has(section) ||
        seen.has(section)
      ) {
        return false;
      }

      seen.add(section);
      return true;
    },
  );
}
