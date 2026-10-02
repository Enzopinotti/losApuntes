import Constants from "expo-constants";

import { mobileRuntime } from "./runtime";
import {
  type MobileReleaseIdentityInput,
  type MobileServerReleaseObservationInput,
  qualifyMobileRelease,
} from "./release-qualification";

function currentMobileReleaseInput(): MobileReleaseIdentityInput {
  return {
    apiOrigin: mobileRuntime.apiOrigin,
    sourceSha: process.env.EXPO_PUBLIC_RELEASE_SHA,
    appVersion: Constants.nativeAppVersion,
    build: Constants.nativeBuildVersion,
    distributionProfile: process.env.EXPO_PUBLIC_DISTRIBUTION_PROFILE,
  };
}

export const currentMobileReleaseIdentity = Object.freeze(
  currentMobileReleaseInput(),
);

export function qualifyCurrentMobileRelease(
  observedServerRelease: MobileServerReleaseObservationInput | null | undefined,
) {
  return qualifyMobileRelease(
    currentMobileReleaseIdentity,
    observedServerRelease,
  );
}
