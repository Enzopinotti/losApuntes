import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import {
  MobileQaNeedsHelpApi,
  QaNeedsHelpHttpTransport,
  type QaNeedsHelpPage,
} from "./qa-needs-help-api";

export interface QaNeedsHelpApi {
  list(
    subjectId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<QaNeedsHelpPage>;
}

export const mobileQaNeedsHelpApi = new MobileQaNeedsHelpApi(
  mobileSessionController,
  new QaNeedsHelpHttpTransport(mobileApiClient),
);
