import Constants from "expo-constants";
import { Platform } from "react-native";

import { mobileRuntime } from "./runtime";
import {
  createMobileReleaseIdentity,
  type MobileReleaseEnvironment,
  qualifyMobileRelease,
} from "./release-qualification";

function releaseEnvironment(): MobileReleaseEnvironment {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

function nativeBuildIdentifier(): string | null {
  if (Platform.OS === "ios") {
    return Constants.expoConfig?.ios?.buildNumber ?? null;
  }
  if (Platform.OS === "android") {
    const versionCode = Constants.expoConfig?.android?.versionCode;
    return versionCode === undefined ? null : String(versionCode);
  }
  return null;
}

export const currentMobileReleaseIdentity = createMobileReleaseIdentity({
  environment: releaseEnvironment(),
  apiOrigin: mobileRuntime.apiOrigin,
  sourceSha: process.env.EXPO_PUBLIC_RELEASE_SHA,
  appVersion: Constants.expoConfig?.version ?? null,
  build: nativeBuildIdentifier(),
  distributionProfile: process.env.EXPO_PUBLIC_DISTRIBUTION_PROFILE,
});

export function qualifyCurrentMobileRelease(
  observedServerReleaseId: string | null | undefined,
) {
  return qualifyMobileRelease(
    currentMobileReleaseIdentity,
    observedServerReleaseId,
  );
}
