import { ApiRequestError } from "@/services/api/client";

export type GoogleIdentityResult =
  | { kind: "success"; idToken: string }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "failed" };

export interface GoogleIdentityProvider {
  requestIdToken(): Promise<GoogleIdentityResult>;
}

export type GoogleLoginOutcome =
  | { kind: "authenticated" }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "provider_failed" }
  | { kind: "link_required" }
  | { kind: "network_failed" }
  | { kind: "authentication_failed" };

export async function requestGoogleIdToken(
  provider: GoogleIdentityProvider,
): Promise<GoogleIdentityResult> {
  try {
    const result = await provider.requestIdToken();
    if (result.kind === "success" && !result.idToken.trim()) {
      return { kind: "failed" };
    }
    return result;
  } catch {
    return { kind: "failed" };
  }
}

export async function loginWithGoogle(
  provider: GoogleIdentityProvider,
  login: (idToken: string) => Promise<void>,
): Promise<GoogleLoginOutcome> {
  const identity = await requestGoogleIdToken(provider);
  if (identity.kind === "cancelled") return { kind: "cancelled" };
  if (identity.kind === "unavailable") return { kind: "unavailable" };
  if (identity.kind === "failed") return { kind: "provider_failed" };

  try {
    await login(identity.idToken);
    return { kind: "authenticated" };
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.code === "GOOGLE_AUTH_UNAVAILABLE") {
        return { kind: "unavailable" };
      }
      if (error.code === "GOOGLE_LINK_REQUIRED") {
        return { kind: "link_required" };
      }
      if (
        error.kind === "offline" ||
        error.kind === "timeout" ||
        error.kind === "server_unavailable"
      ) {
        return { kind: "network_failed" };
      }
    }
    return { kind: "authentication_failed" };
  }
}
