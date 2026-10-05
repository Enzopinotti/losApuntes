import type {
  AuthActionKind,
  AuthActionTokenVault,
} from "./action-token-vault";

const ACTION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

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

export const captureAuthActionLink = (
  raw: string,
  vault: AuthActionTokenVault,
): string | null => {
  const route = parseActionRoute(raw);
  if (!route) return null;

  const token = route.url.searchParams.get("token");
  if (!token || !ACTION_TOKEN_PATTERN.test(token)) {
    return "/sign-in?notice=invalid-action-link";
  }

  const handle = vault.capture(route.kind, token);
  if (!handle) return "/sign-in?notice=invalid-action-link";

  return route.kind === "email_verification"
    ? `/verify-email?handle=${encodeURIComponent(handle)}`
    : `/reset-password?handle=${encodeURIComponent(handle)}`;
};

export const captureEmailVerificationLink = captureAuthActionLink;
