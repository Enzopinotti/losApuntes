import Constants from "expo-constants";

import {
  type MobileReleaseFetch,
  observeMobileServerRelease,
} from "./release-observation";
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

export function observeCurrentMobileServerRelease(
  fetcher?: MobileReleaseFetch,
) {
  return observeMobileServerRelease(
    currentMobileReleaseIdentity.apiOrigin,
    fetcher,
  );
}

export async function qualifyCurrentMobileReleaseFromApi(
  fetcher?: MobileReleaseFetch,
) {
  const observedServerRelease =
    await observeCurrentMobileServerRelease(fetcher);
  return qualifyCurrentMobileRelease(observedServerRelease);
}
