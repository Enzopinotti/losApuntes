import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import {
  MobileResourceConsumptionApi,
  MobileResourceConsumptionHttpTransport,
} from "./resource-consumption-api";
import { MobileResourceApi, MobileResourceHttpTransport } from "./resource-api";
import { ResourceUploadController } from "./resource-upload-controller";
import { uploadResourceBytes } from "./resource-uploader";

export const mobileResourceApi = new MobileResourceApi(
  mobileSessionController,
  new MobileResourceHttpTransport(mobileApiClient),
);

export const mobileResourceConsumptionApi = new MobileResourceConsumptionApi(
  mobileSessionController,
  new MobileResourceConsumptionHttpTransport(mobileApiClient),
);

export const mobileResourceUploadController = new ResourceUploadController(
  mobileResourceApi,
  uploadResourceBytes,
);
