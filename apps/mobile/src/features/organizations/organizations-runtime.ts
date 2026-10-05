import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import {
  MobileOrganizationsApi,
  MobileOrganizationsHttpTransport,
} from "./organizations-api";

export const mobileOrganizationsApi = new MobileOrganizationsApi(
  mobileSessionController,
  new MobileOrganizationsHttpTransport(mobileApiClient),
);
