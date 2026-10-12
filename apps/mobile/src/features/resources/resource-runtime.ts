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

export const mobileResourceApi = new MobileResourceApi(
  mobileSessionController,
  new MobileResourceHttpTransport(mobileApiClient),
);

export const mobileResourceConsumptionApi = new MobileResourceConsumptionApi(
  mobileSessionController,
  new MobileResourceConsumptionHttpTransport(mobileApiClient),
);

export const mobileResourceDirectSharingApi = new MobileResourceDirectSharingApi(
  mobileSessionController,
  mobileApiClient,
  mobileSearchApi,
  mobileResourceConsumptionApi,
);

export const mobileResourceUploadController = new ResourceUploadController(
  mobileResourceApi,
  uploadResourceBytes,
);
