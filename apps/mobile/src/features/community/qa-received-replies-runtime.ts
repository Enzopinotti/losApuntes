import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import {
  MobileQaReceivedRepliesApi,
  QaReceivedRepliesHttpTransport,
  type QaReceivedRepliesPage,
} from "./qa-received-replies-api";

export interface QaReceivedRepliesApi {
  list(cursor?: string, signal?: AbortSignal): Promise<QaReceivedRepliesPage>;
}

export const mobileQaReceivedRepliesApi = new MobileQaReceivedRepliesApi(
  mobileSessionController,
  new QaReceivedRepliesHttpTransport(mobileApiClient),
);
