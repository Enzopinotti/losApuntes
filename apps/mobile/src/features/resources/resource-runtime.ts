import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";
import { mobileSearchApi } from "@/features/search/search-runtime";

import {
  MobileResourceConsumptionApi,
  MobileResourceConsumptionHttpTransport,
} from "./resource-consumption-api";
import { MobileResourceApi, MobileResourceHttpTransport } from "./resource-api";
import { ResourceUploadController } from "./resource-upload-controller";
import { uploadResourceBytes } from "./resource-uploader";
import { MobileResourceDirectSharingApi } from "./resource-direct-sharing-api";
import { MobileOwnedResourcesApi } from "./resource-owned-api";
import { MobileOwnerStatisticsApi } from "./resource-owner-stats-api";
import { MobileSavedSubjectFacetsApi } from "./saved-subject-facets";

export const mobileResourceApi = new MobileResourceApi(
  mobileSessionController,
  new MobileResourceHttpTransport(mobileApiClient),
);

export const mobileResourceConsumptionApi = new MobileResourceConsumptionApi(
  mobileSessionController,
  new MobileResourceConsumptionHttpTransport(mobileApiClient),
);

export const mobileResourceDirectSharingApi =
  new MobileResourceDirectSharingApi(
    mobileSessionController,
    mobileApiClient,
    mobileSearchApi,
    mobileResourceConsumptionApi,
  );

export const mobileOwnedResourcesApi = new MobileOwnedResourcesApi(
  mobileSessionController,
  mobileApiClient,
);

export const mobileOwnerStatisticsApi = new MobileOwnerStatisticsApi(
  mobileSessionController,
  mobileApiClient,
);

export const mobileResourceUploadController = new ResourceUploadController(
  mobileResourceApi,
  uploadResourceBytes,
);

export const mobileSavedSubjectFacetsApi = new MobileSavedSubjectFacetsApi(
  mobileSessionController,
  mobileApiClient,
);
