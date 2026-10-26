import type { AcademicProfileProjection } from "@losapuntes/contracts";

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function publicProfileAcademicSummary(
  academic: AcademicProfileProjection,
): string[] {
  const affiliationCount = Array.isArray(academic.affiliations)
    ? academic.affiliations.length
    : 0;
  const participationCount = Array.isArray(academic.participations)
    ? academic.participations.length
    : 0;

  return [
    countLabel(
      affiliationCount,
      "afiliación académica publicada.",
      "afiliaciones académicas publicadas.",
    ).trim(),
    countLabel(
      participationCount,
      "materia asociada.",
      "materias asociadas.",
    ).trim(),
  ];
}
