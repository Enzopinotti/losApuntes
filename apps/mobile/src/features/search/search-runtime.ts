import { mobileSessionController } from "@/features/session/session-runtime";
import { mobileApiClient } from "@/features/session/session-runtime";

import { MobileSearchApi } from "./search-api";

export const mobileSearchApi = new MobileSearchApi(
  mobileSessionController,
  mobileApiClient,
);
