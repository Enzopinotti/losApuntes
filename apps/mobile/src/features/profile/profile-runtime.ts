import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import { MobileProfileApi, MobileProfileHttpTransport } from "./profile-api";
import { MobileProfileController } from "./profile-controller";

export const mobileProfileApi = new MobileProfileApi(
  mobileSessionController,
  new MobileProfileHttpTransport(mobileApiClient),
);

export const mobileProfileController = new MobileProfileController(
  mobileProfileApi,
);
