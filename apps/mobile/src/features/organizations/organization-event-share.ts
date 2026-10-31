import type { OrganizationEvent } from "@losapuntes/contracts";

const MAX_EXTERNAL_URL_LENGTH = 2048;
const MAX_SHARED_TITLE_LENGTH = 160;

export function safeOrganizationEventExternalUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_EXTERNAL_URL_LENGTH ||
    /[\u0000-\u0020\u007f]/u.test(value)
  ) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function mobileOrganizationEventShareMessage(
  event: Pick<OrganizationEvent, "title" | "externalUrl" | "state">,
): string | null {
  if (event.state !== "scheduled") return null;
  const url = safeOrganizationEventExternalUrl(event.externalUrl);
  if (!url) return null;

  const title = event.title
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .trim()
    .slice(0, MAX_SHARED_TITLE_LENGTH);

  return title ? `Evento: ${title}\n${url}` : url;
}
