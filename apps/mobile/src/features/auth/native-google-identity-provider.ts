import Constants from "expo-constants";
import { Platform } from "react-native";

import type { GoogleIdentityProvider } from "./google-mobile-flow";

type GoogleMobileConfig = {
  webClientId?: string | null;
  iosClientId?: string | null;
  iosUrlSchemeConfigured?: boolean;
};

const config = Constants.expoConfig?.extra?.googleMobile as
  GoogleMobileConfig | undefined;

let configuredKey: string | null = null;

export function isNativeGoogleConfigured(): boolean {
  if (!config?.webClientId?.trim()) return false;
  if (Platform.OS === "ios") {
    return Boolean(config.iosClientId?.trim() && config.iosUrlSchemeConfigured);
  }
  return Platform.OS === "android";
}

export const nativeGoogleIdentityProvider: GoogleIdentityProvider = {
  async requestIdToken() {
    if (!isNativeGoogleConfigured() || !config?.webClientId) {
      return { kind: "unavailable" };
    }

    let googleSdk: typeof import("react-native-nitro-google-signin");
    try {
      googleSdk = await import("react-native-nitro-google-signin");
    } catch {
      return { kind: "unavailable" };
    }

    try {
      const nextConfiguredKey = [
        config.webClientId,
        config.iosClientId ?? "",
      ].join(":");
      if (configuredKey !== nextConfiguredKey) {
        googleSdk.GoogleOneTapSignIn.configure({
          webClientId: config.webClientId,
          ...(config.iosClientId ? { iosClientId: config.iosClientId } : {}),
          offlineAccess: false,
          autoSelectOnSignIn: false,
          scopes: [],
        });
        configuredKey = nextConfiguredKey;
      }

      if (Platform.OS === "android") {
        await googleSdk.GoogleOneTapSignIn.checkPlayServices();
      }

      const response =
        await googleSdk.GoogleOneTapSignIn.presentExplicitSignIn();
      if (googleSdk.isCancelledResponse(response)) {
        return { kind: "cancelled" };
      }
      if (!googleSdk.isSuccessResponse(response)) {
        return { kind: "failed" };
      }

      const idToken = response.data.idToken;
      return idToken.trim() ? { kind: "success", idToken } : { kind: "failed" };
    } catch (error) {
      if (
        googleSdk.isErrorWithCode(error) &&
        error.code === googleSdk.statusCodes.PLAY_SERVICES_NOT_AVAILABLE
      ) {
        return { kind: "unavailable" };
      }
      if (
        googleSdk.isErrorWithCode(error) &&
        error.code === googleSdk.statusCodes.SIGN_IN_CANCELLED
      ) {
        return { kind: "cancelled" };
      }
      return { kind: "failed" };
    }
  },
};
