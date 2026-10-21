/**
 * B170: citation preview from currently-authorized ResourceView metadata.
 * A citation is user-provided attribution, not verified authorship,
 * not a standards-certified APA reference, and never an access grant.
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu;

function normalize(value, field, limit) {
  if (typeof value !== "string") {
    throw new TypeError("Invalid academic citation " + field);
  }
  const clean = value.replace(CONTROL, " ").replace(/\s+/gu, " ").trim();
  if (clean.length === 0 || clean.length > limit) {
    throw new TypeError("Academic citation " + field + " exceeds bounds or is blank");
  }
  return clean;
}

function optional(value, limit, fallback) {
  if (value == null || value === "") return fallback;
  return normalize(value, "optional label", limit);
}

function publicResourceUrl(resourceId, origin) {
  const value = new URL(origin);
  if (!["https:", "http:"].includes(value.protocol) ||
      value.username || value.password ||
      value.pathname !== "/" || value.search || value.hash ||
      value.origin !== origin) {
    throw new TypeError("Invalid first-party origin for academic citation");
  }
  return value.origin + "/resources/" + encodeURIComponent(resourceId.toLowerCase());
}

export function buildResourceCitation(resource, origin) {
  if (!resource || typeof resource !== "object") {
    throw new TypeError("Invalid resource for citation");
  }
  if (typeof resource.id !== "string" || !UUID_V4.test(resource.id)) {
    throw new TypeError("Invalid resource identifier for citation");
  }
  if (!["public", "shared", "private"].includes(resource.visibility)) {
    throw new TypeError("Unrecognized resource access level");
  }

  const title = normalize(resource.title, "title", 250);
  const subject = normalize(resource.academic?.subject?.name, "subject", 180);
  const author = optional(resource.author?.displayName, 160, "Autoría no indicada");
  // Existing ResourceView does not guarantee a bibliographic publication date.
  // Explicitly state "sin fecha" instead of inferring one from upload/update.
  const reference =
    author + ". (s. f.). " + title + " [Apunte de " + subject + "]. Los Apuntes.";
  const shareableLink = resource.visibility === "public"
    ? publicResourceUrl(resource.id, origin)
    : null;

  return {
    text: shareableLink ? reference + "\nDisponible en: " + shareableLink : reference,
    publicLinkIncluded: shareableLink !== null,
    visibility: resource.visibility,
    attributionVerified: false,
    grantsResourceAccess: false,
  };
}
