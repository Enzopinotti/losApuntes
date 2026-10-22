import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import { AcademicFollowsMobileApi } from "./academic-follows-api";

export const mobileAcademicFollowsApi = new AcademicFollowsMobileApi(
  mobileSessionController,
  mobileApiClient,
);
