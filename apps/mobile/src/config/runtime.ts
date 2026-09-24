const parseApiOrigin = (raw: string | undefined): string => {
  if (!raw) {
    throw new Error("EXPO_PUBLIC_API_ORIGIN is required");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("EXPO_PUBLIC_API_ORIGIN must be an absolute HTTP(S) origin");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("EXPO_PUBLIC_API_ORIGIN must be an absolute HTTP(S) origin");
  }

  return url.origin;
};

export const mobileRuntime = Object.freeze({
  apiOrigin: parseApiOrigin(process.env.EXPO_PUBLIC_API_ORIGIN),
});
