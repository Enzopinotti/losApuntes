import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import {
  MobileStudyCollectionsApi,
  StudyCollectionsHttpTransport,
} from "./study-collections-api";

export const mobileStudyCollectionsApi = new MobileStudyCollectionsApi(
  mobileSessionController,
  new StudyCollectionsHttpTransport(mobileApiClient),
);
