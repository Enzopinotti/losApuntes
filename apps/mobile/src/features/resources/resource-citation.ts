import type { ResourceView } from "@losapuntes/contracts";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu;

function normalize(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(CONTROL, " ").replace(/\s+/gu, " ").trim();
  return clean.length > 0 && clean.length <= maxLength ? clean : null;
}

/**
 * Builds a reviewable, non-certified reference from the authorized resource
 * projection. It never infers a publication date or embeds an access link.
 */
export function buildMobileResourceCitation(
  resource: ResourceView,
): string | null {
  if (!resource || !UUID_V4.test(resource.id)) return null;

  const title = normalize(resource.title, 250);
  const subject = normalize(resource.academic?.subject?.name, 180);
  const author = resource.author
    ? normalize(resource.author.displayName, 160)
    : "Autoría no indicada";
  if (!title || !subject || !author) return null;

  return `${author}. (s. f.). ${title} [Apunte de ${subject}]. Los Apuntes.`;
}
