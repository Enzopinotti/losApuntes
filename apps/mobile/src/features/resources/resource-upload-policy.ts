import type { ResourceUploadIntent } from "./resource-types";

export function isPermittedStorageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return (
    (url.protocol === "https:" || (url.protocol === "http:" && loopback)) &&
    !url.username &&
    !url.password &&
    !url.hash
  );
}

export function hasCredentialHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((name) =>
    ["authorization", "cookie", "proxy-authorization"].includes(
      name.toLowerCase(),
    ),
  );
}

export function isPermittedUploadIntent(
  upload: ResourceUploadIntent["upload"],
): boolean {
  return (
    upload.method === "PUT" &&
    isPermittedStorageUrl(upload.url) &&
    !hasCredentialHeader(upload.headers)
  );
}
