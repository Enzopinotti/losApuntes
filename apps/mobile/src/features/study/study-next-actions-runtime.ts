import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import {
  MobileStudyNextActionsApi,
  StudyNextActionsHttpTransport,
} from "./study-next-actions-api";

export const mobileStudyNextActionsApi = new MobileStudyNextActionsApi(
  mobileSessionController,
  new StudyNextActionsHttpTransport(mobileApiClient),
);
