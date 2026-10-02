import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import {
  MobileCommunityApi,
  MobileCommunityHttpTransport,
} from "./community-api";

export const mobileCommunityApi = new MobileCommunityApi(
  mobileSessionController,
  new MobileCommunityHttpTransport(mobileApiClient),
);
