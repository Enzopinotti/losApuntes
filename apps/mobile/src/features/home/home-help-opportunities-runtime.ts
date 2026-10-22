import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import {
  HomeHelpOpportunitiesHttpTransport,
  MobileHomeHelpOpportunitiesApi,
} from "./home-help-opportunities-api";

export const mobileHomeHelpOpportunitiesApi =
  new MobileHomeHelpOpportunitiesApi(
    mobileSessionController,
    new HomeHelpOpportunitiesHttpTransport(mobileApiClient),
  );
