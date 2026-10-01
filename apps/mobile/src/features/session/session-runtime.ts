import { mobileRuntime } from "@/config/runtime";
import { createSerializedCredentialStore } from "@/features/session/serialized-credential-store";
import { secureSessionCredentialStore } from "@/platform/session-credential-store";
import { MobileApiClient } from "@/services/api/client";

import { AuthenticatedMobileApi } from "./authenticated-api";
import { SessionController } from "./session-controller";

export const mobileApiClient = new MobileApiClient(mobileRuntime.apiOrigin);

const credentialStore = createSerializedCredentialStore(
  secureSessionCredentialStore,
);

export const mobileSessionController = new SessionController(
  mobileApiClient,
  credentialStore,
);

export const mobileAuthenticatedApi = new AuthenticatedMobileApi(
  mobileSessionController,
  mobileApiClient,
);
