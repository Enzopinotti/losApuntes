import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import {
  MobileQaActivityCalendarApi,
  QaActivityCalendarHttpTransport,
} from "./qa-activity-calendar-api";

export const mobileQaActivityCalendarApi = new MobileQaActivityCalendarApi(
  mobileSessionController,
  new QaActivityCalendarHttpTransport(mobileApiClient),
);
