import type {
  AuthActionKind,
  AuthActionTokenVault,
} from "./action-token-vault";

const ACTION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export interface ParsedAuthActionLink {
  kind: AuthActionKind;
  token: string;
}

const parseActionRoute = (
  raw: string,
): { url: URL; kind: AuthActionKind } | null => {
  let url: URL;
  try {
    // Expo Router may pass either the original scheme URL or its normalized path.
    url = new URL(raw, "losapuntes:/");
  } catch {
    return null;
  }
  if (url.protocol !== "losapuntes:") return null;

  const route = [url.hostname, url.pathname]
    .join("/")
    .replace(/^\/+|\/+$/gu, "");

  if (route === "verify-email") return { url, kind: "email_verification" };
  if (route === "recover-password") return { url, kind: "password_recovery" };
  return null;
};

export const captureEmailVerificationLink = (
  raw: string,
  vault: AuthActionTokenVault,
): string | null => {
  const route = parseActionRoute(raw);
  if (!route) return null;

  const token = route.url.searchParams.get("token");
  if (!token || !ACTION_TOKEN_PATTERN.test(token)) {
    return "/sign-in?notice=invalid-action-link";
  }

  if (route.kind === "password_recovery") {
    return "/sign-in?notice=recovery-unavailable";
  }

  const handle = vault.capture(route.kind, token);
  if (!handle) return "/sign-in?notice=invalid-action-link";
  return `/verify-email?handle=${encodeURIComponent(handle)}`;
};

export const parseAuthActionLink = (
  raw: string,
): ParsedAuthActionLink | null => {
  const route = parseActionRoute(raw);
  if (!route) return null;

  const token = route.url.searchParams.get("token");

  if (!token || !ACTION_TOKEN_PATTERN.test(token)) return null;

  return { kind: route.kind, token };
};
