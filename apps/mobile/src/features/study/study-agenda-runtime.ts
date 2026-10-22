import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import {
  MobileStudyAgendaApi,
  StudyAgendaHttpTransport,
} from "./study-agenda-api";

export const mobileStudyAgendaApi = new MobileStudyAgendaApi(
  mobileSessionController,
  new StudyAgendaHttpTransport(mobileApiClient),
);
