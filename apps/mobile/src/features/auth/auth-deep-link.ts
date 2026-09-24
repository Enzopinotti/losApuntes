import type { AuthActionKind } from "./action-token-vault";

const ACTION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export interface ParsedAuthActionLink {
  kind: AuthActionKind;
  token: string;
}

const actionKind = (url: URL): AuthActionKind | null => {
  if (url.protocol !== "losapuntes:") return null;

  const route = [url.hostname, url.pathname]
    .join("/")
    .replace(/^\/+|\/+$/gu, "");

  if (route === "verify-email") return "email_verification";
  if (route === "recover-password") return "password_recovery";
  return null;
};

export const parseAuthActionLink = (
  raw: string,
): ParsedAuthActionLink | null => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const kind = actionKind(url);
  const token = url.searchParams.get("token");

  if (!kind || !token || !ACTION_TOKEN_PATTERN.test(token)) return null;

  return { kind, token };
};
