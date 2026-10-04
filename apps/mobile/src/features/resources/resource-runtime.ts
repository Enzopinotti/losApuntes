import {
  mobileApiClient,
  mobileSessionController,
} from "@/features/session/session-runtime";

import { MobileResourceApi, MobileResourceHttpTransport } from "./resource-api";
import { ResourceUploadController } from "./resource-upload-controller";
import { uploadResourceBytes } from "./resource-uploader";

export const mobileResourceApi = new MobileResourceApi(
  mobileSessionController,
  new MobileResourceHttpTransport(mobileApiClient),
);

export const mobileResourceUploadController = new ResourceUploadController(
  mobileResourceApi,
  uploadResourceBytes,
);
