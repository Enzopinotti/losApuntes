const RESOURCE_UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu;
const RESOURCE_SCHEME = "losapuntes:///resources/";

export type MobileResourceSharePayload = {
  title: string;
  url: string;
  message: string;
};

export function buildMobileResourceSharePayload(resource: {
  id: unknown;
  title: unknown;
}): MobileResourceSharePayload | null {
  if (typeof resource.id !== "string" || !RESOURCE_UUID_V4.test(resource.id)) {
    return null;
  }
  if (typeof resource.title !== "string") return null;

  const title = resource.title
    .replace(CONTROL, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!title || title.length > 250) return null;

  const url = `${RESOURCE_SCHEME}${resource.id.toLowerCase()}`;
  return { title, url, message: `${title}\n${url}` };
}
